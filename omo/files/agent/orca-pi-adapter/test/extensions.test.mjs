import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { chmod, mkdir, mkdtemp, readFile, watch, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const statusPath = new URL('../../extensions/orca-agent-status.ts', import.meta.url).href
const reporterPath = new URL('../../extensions/omo-supervision-reporter.ts', import.meta.url).href
const prefillPath = new URL('../../extensions/orca-prefill.ts', import.meta.url).href
const titlePath = new URL('../../extensions/orca-titlebar-spinner.ts', import.meta.url).href

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
  globalThis.fetch = originalFetch
  resetOrcaOwnership()
})

function resetOrcaOwnership() {
  delete process.env.ORCA_PI_STATUS_OWNED
  delete process.env.ORCA_PI_SUPERVISION_OWNED
  delete process.env.ORCA_PI_PREFILL_OWNED
  delete process.env.ORCA_PI_TITLE_OWNED
  delete globalThis[Symbol.for('orca-pi-status-extension')]
  delete globalThis[Symbol.for('omo-supervision-reporter-extension')]
  delete globalThis[Symbol.for('orca-pi-prefill-extension')]
  delete globalThis[Symbol.for('orca-pi-title-extension')]
}

function fakePi(initialSessionName = 'qa') {
  const handlers = new Map()
  let sessionName = initialSessionName
  return {
    handlers,
    on(name, handler) {
      handlers.set(name, handler)
    },
    getSessionName() {
      return sessionName
    },
    setSessionName(name) {
      sessionName = name
    }
  }
}

async function installOrcaTitleStub(title) {
  const directory = await mkdtemp(join(tmpdir(), 'orca-title-stub-'))
  const command = join(directory, 'orca')
  const logPath = join(directory, 'calls.log')
  await writeFile(
    command,
    '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$ORCA_TEST_ORCA_LOG"\nprintf \'{"ok":true,"result":{"terminal":{"title":"%s"}}}\\n\' "$ORCA_TEST_ORCA_TITLE"\n'
  )
  await chmod(command, 0o755)
  process.env.PATH = `${directory}:${process.env.PATH}`
  process.env.ORCA_TEST_ORCA_LOG = logPath
  process.env.ORCA_TEST_ORCA_TITLE = title
  return { logPath }
}

test('prefill registers once per process and consumes a startup draft', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_PI_PREFILL = 'draft text'
  const { default: prefill } = await import(`${prefillPath}?prefill=${Date.now()}`)
  const first = fakePi()
  prefill(first)
  const writes = []
  await first.handlers.get('session_start')({ reason: 'startup' }, { ui: { setEditorText: (value) => writes.push(value) } })
  assert.deepEqual(writes, ['draft text'])
  assert.equal(process.env.ORCA_PI_PREFILL, undefined)

  const second = fakePi()
  prefill(second)
  assert.equal(second.handlers.size, 0)
})

test('title spinner stays active through agent_end and stops on agent_settled', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  await installOrcaTitleStub('{qa - agent}')
  const { default: titlebar } = await import(`${titlePath}?title=${Date.now()}`)
  const pi = fakePi()
  titlebar(pi)
  const titles = []
  const ctx = { ui: { setTitle: (value) => titles.push(value) } }
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let intervalDelay
  globalThis.setInterval = (_callback, delay) => {
    intervalDelay = delay
    return 1
  }
  globalThis.clearInterval = () => {}
  try {
    await pi.handlers.get('agent_start')({}, ctx)
    assert.equal(intervalDelay, 500)
    await pi.handlers.get('agent_end')({}, ctx)
    assert.match(titles.at(-1), /^\{(?:⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏) qa\}$/)
  } finally {
    await pi.handlers.get('agent_settled')({}, ctx)
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
  assert.equal(titles.at(-1), '{qa}')
})

test('title spinner replaces the automatic startup paste path with only the working-directory basename', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  await installOrcaTitleStub('/var/folders/6z/00znjmd54_v5r_ccgckhkz6r0000gn/T/orca-paste-1788769276208-71612318-817d-4b09-9a86-ea09e1865a71.png')
  const { default: titlebar } = await import(`${titlePath}?startup-title=${Date.now()}`)
  const pi = fakePi(null)
  titlebar(pi)
  const titles = []
  await pi.handlers.get('session_start')({ reason: 'startup' }, { ui: { setTitle: (value) => titles.push(value) } })
  assert.deepEqual(titles, ['{agent}'])
})

test('title spinner claims Senpi’s startup title after the startup writer runs', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  await installOrcaTitleStub('zsh')
  const { default: titlebar } = await import(`${titlePath}?deferred-startup-title=${Date.now()}`)
  const pi = fakePi(null)
  titlebar(pi)
  const titles = []
  const originalSetTimeout = globalThis.setTimeout
  let startupCallback
  globalThis.setTimeout = (callback) => {
    startupCallback = callback
    return 1
  }
  try {
    await pi.handlers.get('session_start')({ reason: 'startup' }, { ui: { setTitle: (value) => titles.push(value) } })
    process.env.ORCA_TEST_ORCA_TITLE = 'OmO - agent'
    startupCallback()
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
  assert.deepEqual(titles, ['{agent}'])
})

test('title spinner uses only the generated session name after session_info_changed', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  await installOrcaTitleStub('{agent}')
  const { default: titlebar } = await import(`${titlePath}?generated-title=${Date.now()}`)
  const pi = fakePi(null)
  titlebar(pi)
  const titles = []
  const ctx = { ui: { setTitle: (value) => titles.push(value) } }
  pi.setSessionName('Fix Orca titles')
  process.env.ORCA_TEST_ORCA_TITLE = 'OmO - Fix Orca titles - agent'
  await pi.handlers.get('session_info_changed')({ name: 'Fix Orca titles' }, ctx)
  assert.deepEqual(titles, ['{Fix Orca titles}'])
  assert.match(
    await readFile(process.env.ORCA_TEST_ORCA_LOG, 'utf8'),
    /^terminal rename --terminal term_qa --title \{Fix Orca titles\} --json$/m
  )
})

test('title spinner stops without replacing a manual rename during animation', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  await installOrcaTitleStub('{agent}')
  const { default: titlebar } = await import(`${titlePath}?mid-animation-manual-title=${Date.now()}`)
  const pi = fakePi(null)
  titlebar(pi)
  const titles = []
  const ctx = { ui: { setTitle: (value) => titles.push(value) } }
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let intervalCallback
  globalThis.setInterval = (callback) => {
    intervalCallback = callback
    return 1
  }
  globalThis.clearInterval = () => {}
  try {
    await pi.handlers.get('agent_start')({}, ctx)
    process.env.ORCA_TEST_ORCA_TITLE = 'Manual Orca title'
    intervalCallback()
    pi.setSessionName('Generated title')
    await pi.handlers.get('session_info_changed')({ name: 'Generated title' }, ctx)
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
  assert.deepEqual(titles, ['{⠋ agent}'])
})

test('title spinner preserves a manually renamed Orca pane after reading its live title', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  const { logPath } = await installOrcaTitleStub('Manual Orca title')
  const { default: titlebar } = await import(`${titlePath}?manual-title=${Date.now()}`)
  const pi = fakePi()
  titlebar(pi)
  const titles = []
  const ctx = { ui: { setTitle: (value) => titles.push(value) } }
  await pi.handlers.get('agent_start')({}, ctx)
  await pi.handlers.get('agent_settled')({}, ctx)
  assert.deepEqual(titles, [])
  assert.match(await readFile(logPath, 'utf8'), /^terminal show --terminal term_qa --json/m)
})

test('title spinner rebinds after reload for an automatically generated Korean session name', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  await installOrcaTitleStub('{agent}')
  const { default: initialTitlebar } = await import(`${titlePath}?initial-auto-title=${Date.now()}`)
  initialTitlebar(fakePi(null))
  const { default: reloadedTitlebar } = await import(`${titlePath}?reloaded-auto-title=${Date.now()}`)
  const pi = fakePi(null)
  reloadedTitlebar(pi)
  const titles = []
  const ctx = { ui: { setTitle: (value) => titles.push(value) } }
  pi.setSessionName('ㅎㅇ')
  process.env.ORCA_TEST_ORCA_TITLE = 'OmO - ㅎㅇ - agent'
  await pi.handlers.get('session_info_changed')({ name: 'ㅎㅇ' }, ctx)
  assert.deepEqual(titles, ['{ㅎㅇ}'])
})

test('session renames update only the owning shared tab for split panes', async () => {
  resetOrcaOwnership()
  await installOrcaTitleStub('{agent}')

  process.env.ORCA_PANE_KEY = 'tab_qa:left'
  process.env.ORCA_TERMINAL_HANDLE = 'term_left'
  const { default: leftTitlebar } = await import(`${titlePath}?left-pane=${Date.now()}`)
  const leftPi = fakePi(null)
  leftTitlebar(leftPi)

  process.env.ORCA_PANE_KEY = 'tab_qa:right'
  process.env.ORCA_TERMINAL_HANDLE = 'term_right'
  const { default: rightTitlebar } = await import(`${titlePath}?right-pane=${Date.now()}`)
  const rightPi = fakePi(null)
  rightTitlebar(rightPi)

  const leftTitles = []
  const rightTitles = []
  leftPi.setSessionName('왼쪽 세션')
  process.env.ORCA_TERMINAL_HANDLE = 'term_left'
  await leftPi.handlers.get('session_info_changed')({}, { ui: { setTitle: (value) => leftTitles.push(value) } })
  rightPi.setSessionName('오른쪽 세션')
  process.env.ORCA_TERMINAL_HANDLE = 'term_right'
  await rightPi.handlers.get('session_info_changed')({}, { ui: { setTitle: (value) => rightTitles.push(value) } })

  assert.deepEqual(leftTitles, ['{왼쪽 세션}'])
  assert.deepEqual(rightTitles, ['{오른쪽 세션}'])
  const calls = await readFile(process.env.ORCA_TEST_ORCA_LOG, 'utf8')
  assert.match(calls, /^terminal show --terminal term_left --json/m)
  assert.match(calls, /^terminal show --terminal term_right --json/m)
  assert.match(calls, /^terminal rename --terminal term_left --title \{왼쪽 세션\} --json$/m)
  assert.match(calls, /^terminal rename --terminal term_right --title \{오른쪽 세션\} --json$/m)
  assert.doesNotMatch(calls, /terminal rename --terminal term_(?!left|right)/)
})

test('title override survives automatic progress titles and settles without changing the tab', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'tab_qa:leaf_qa'
  process.env.ORCA_TERMINAL_HANDLE = 'term_qa'
  process.env.HOME = await mkdtemp(join(tmpdir(), 'orca-title-override-'))
  const overridesDirectory = join(process.env.HOME, '.omo', 'agent', 'pane-title-overrides')
  await mkdir(overridesDirectory, { recursive: true })
  await writeFile(
    join(overridesDirectory, 'tab_qa_leaf_qa.json'),
    JSON.stringify({ paneKey: process.env.ORCA_PANE_KEY, title: 'Requested pane title' })
  )
  await installOrcaTitleStub('OmO - Running eval')
  const { default: titlebar } = await import(`${titlePath}?override=${Date.now()}`)
  const pi = fakePi()
  titlebar(pi)
  const titles = []
  const ctx = { ui: { setTitle: (value) => titles.push(value) } }
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let intervalCallback
  globalThis.setInterval = (callback) => {
    intervalCallback = callback
    return 1
  }
  globalThis.clearInterval = () => {}
  try {
    await pi.handlers.get('session_start')({ reason: 'reload' }, ctx)
    assert.equal(titles.at(-1), '{Requested pane title}')
    await pi.handlers.get('agent_start')({}, ctx)
    assert.match(titles.at(-1), /^\{(?:⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏) Requested pane title\}$/)
    process.env.ORCA_TEST_ORCA_TITLE = 'OmO - Running eval'
    intervalCallback()
    assert.match(titles.at(-1), /^\{(?:⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏) Requested pane title\}$/)
    await pi.handlers.get('agent_settled')({}, ctx)
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
  assert.equal(titles.at(-1), '{Requested pane title}')
})

test('status extension does not register twice in one OMO process', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  const { default: status } = await import(`${statusPath}?status=${Date.now()}`)
  const first = fakePi()
  status(first)
  assert.equal(first.handlers.has('agent_settled'), true)
  const second = fakePi()
  status(second)
  assert.equal(second.handlers.size, 0)
})

test('supervision reporter does not register twice in one OMO process', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  const { default: reporter } = await import(`${reporterPath}?reporter=${Date.now()}`)
  const first = fakePi()
  reporter(first)
  assert.equal(first.handlers.has('before_agent_start'), true)
  const second = fakePi()
  reporter(second)
  assert.equal(second.handlers.size, 0)
})

test('status extension reclaims an unrelated stale owner for direct OMO', async () => {
  resetOrcaOwnership()
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_PI_STATUS_OWNED = '99999999'
  const { default: status } = await import(`${statusPath}?stale=${Date.now()}`)
  const pi = fakePi()
  status(pi)
  assert.equal(pi.handlers.has('before_agent_start'), true)
  assert.equal(process.env.ORCA_PI_STATUS_OWNED, String(process.pid))
})

test('status extension records a rejected Orca hook response without secrets', async () => {
  resetOrcaOwnership()
  const directory = await mkdtemp(join(tmpdir(), 'orca-pi-status-'))
  const diagnosticPath = join(directory, 'status.json')
  process.env.ORCA_PANE_KEY = 'pane_qa'
  process.env.ORCA_AGENT_HOOK_PORT = '43123'
  process.env.ORCA_AGENT_HOOK_TOKEN = 'secret-token'
  process.env.ORCA_PI_STATUS_DIAGNOSTIC = diagnosticPath
  globalThis.fetch = async () => new Response('', { status: 409 })
  const { default: status } = await import(`${statusPath}?diagnostic=${Date.now()}`)
  const pi = fakePi()
  status(pi)
  const changes = watch(directory)
  const changed = changes[Symbol.asyncIterator]().next()
  await pi.handlers.get('before_agent_start')({ prompt: 'private prompt' }, {})
  try {
    await Promise.race([
      changed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('diagnostic timeout')), 2000))
    ])
  } finally {
    await changes.return()
  }
  const diagnostic = JSON.parse(await readFile(diagnosticPath, 'utf8'))
  assert.equal(diagnostic.event, 'before_agent_start')
  assert.equal(diagnostic.outcome, 'rejected')
  assert.equal(diagnostic.status, 409)
  assert.equal(JSON.stringify(diagnostic).includes('secret-token'), false)
  assert.equal(JSON.stringify(diagnostic).includes('private prompt'), false)
})
