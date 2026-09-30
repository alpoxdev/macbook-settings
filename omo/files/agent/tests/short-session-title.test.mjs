import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import shortSessionTitleExtension, {
  SHORT_SESSION_TITLE_MAX_CODEPOINTS,
  SHORT_SESSION_TITLE_MAX_WORDS,
  deriveShortSessionTitle
} from '../extensions/short-session-title.ts'

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

test('keeps a short three-word Korean title unchanged', () => {
  assert.equal(deriveShortSessionTitle('Desktop UI 추가구현'), 'Desktop UI 추가구현')
})

test('drops a standalone trailing Korean request filler', () => {
  assert.equal(deriveShortSessionTitle('App 리팩토링 해줘'), 'App 리팩토링')
})

test('drops an attached Korean request ending', () => {
  assert.equal(deriveShortSessionTitle('탭 제목 추가구현해줘'), '탭 제목 추가구현')
})

test('returns null when the prompt carries no meaningful text', () => {
  const inputs = ['', '   \n\t ', 'https://example.com/very/long/path?q=1', '/', '/name', '😀😀', null, undefined]
  for (const input of inputs) {
    assert.equal(deriveShortSessionTitle(input), null, `input: ${JSON.stringify(input)}`)
  }
})

test('keeps only the first sentence', () => {
  assert.equal(deriveShortSessionTitle('Fix login redirect. Then update the docs.'), 'Fix login redirect')
})

test('drops an English leading filler and trailing noise', () => {
  assert.equal(
    deriveShortSessionTitle('Please refactor the login page so it uses the new auth flow'),
    'refactor the login page'
  )
})

test(`caps the title at ${SHORT_SESSION_TITLE_MAX_WORDS} words`, () => {
  assert.equal(deriveShortSessionTitle('Add dark mode toggle to the settings screen'), 'Add dark mode toggle')
})

test('clamps a long single word without splitting a surrogate pair', () => {
  const result = deriveShortSessionTitle(`${'가'.repeat(20)}${'𝔘'.repeat(5)}${'나'.repeat(10)}`)
  assert.ok(result !== null)
  assert.ok(Array.from(result).length <= SHORT_SESSION_TITLE_MAX_CODEPOINTS)
  assert.equal(result.endsWith('…'), true)
  assert.equal(hasLoneSurrogate(result), false)
})

test('clamps a long multi-word title to the codepoint budget', () => {
  const result = deriveShortSessionTitle('Refactor authentication middleware')
  assert.equal(result, 'Refactor authentication…')
  assert.equal(Array.from(result).length, SHORT_SESSION_TITLE_MAX_CODEPOINTS)
})

test('treats a slash command with arguments as no title', () => {
  assert.equal(deriveShortSessionTitle('/name 사용자지정'), null)
})

// ---------------------------------------------------------------------------
// Lifecycle binding: the hook must store one name per session, on the first
// real prompt of an Orca-hosted session, and never touch a name that exists.
// ---------------------------------------------------------------------------

const EXTENSION_KEY = Symbol.for('omo-short-session-title-extension')
const ORCA_ENV_KEYS = ['ORCA_PANE_KEY', 'ORCA_TERMINAL_HANDLE', 'ORCA_PI_TITLE_OWNED']
const originalEnv = Object.fromEntries(ORCA_ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  delete globalThis[EXTENSION_KEY]
  for (const key of ORCA_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

// Mirrors the runtime's runner: every handler registered for an event runs, in
// registration order, and setSessionName dispatches session_info_changed back to
// registered handlers. A listener in this extension would therefore feed itself.
function fakePi(initialName) {
  const listeners = new Map()
  const events = []
  let name = initialName
  let dispatching = false
  return {
    listeners,
    events,
    on(event, handler) {
      const registered = listeners.get(event) ?? []
      registered.push(handler)
      listeners.set(event, registered)
    },
    registered(event) {
      return listeners.get(event)?.length ?? 0
    },
    async dispatch(event, payload) {
      for (const handler of listeners.get(event) ?? []) await handler(payload, {})
    },
    getSessionName() {
      return name
    },
    // A new session's SessionManager holds no session_info entry, and changing
    // sessions is not a rename, so this emits no session_info_changed.
    forgetName() {
      name = undefined
    },
    setSessionName(next) {
      name = next
      const event = { type: 'session_info_changed', name }
      events.push(event)
      const registered = listeners.get('session_info_changed') ?? []
      if (registered.length > 0 && !dispatching) {
        dispatching = true
        try {
          for (const handler of registered) handler(event, {})
        } finally {
          dispatching = false
        }
      }
    }
  }
}

// The host shell may itself be Orca-hosted, so every test states all three
// variables explicitly instead of inheriting the pane it runs inside.
function setOrcaEnv({ paneKey, terminalHandle, ownerPid } = {}) {
  const values = {
    ORCA_PANE_KEY: paneKey,
    ORCA_TERMINAL_HANDLE: terminalHandle,
    ORCA_PI_TITLE_OWNED: ownerPid
  }
  for (const key of ORCA_ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
}

function enterOrcaHost() {
  setOrcaEnv({ paneKey: 'tab_qa:leaf_qa', terminalHandle: 'term_qa', ownerPid: String(process.pid) })
}

function prompt(pi, text, preview = false) {
  return pi.dispatch('before_agent_start', { prompt: text, preview })
}

test('names the session exactly once on the first real Orca prompt', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  assert.deepEqual([...pi.listeners.keys()].sort(), ['before_agent_start', 'session_start'])

  await pi.dispatch('session_start', { reason: 'startup' })
  await prompt(pi, 'App 리팩토링 해줘')
  assert.equal(pi.getSessionName(), 'App 리팩토링')
  assert.deepEqual(pi.events, [{ type: 'session_info_changed', name: 'App 리팩토링' }])

  await prompt(pi, '다른 작업도 해줘')
  assert.equal(pi.getSessionName(), 'App 리팩토링')
  assert.equal(pi.events.length, 1)
})

test('never renames a session that already has a name', async () => {
  // `--name`, a resumed session, and a previous `/name` all arrive as an
  // existing session name before the first prompt.
  enterOrcaHost()
  const pi = fakePi('사용자지정')
  shortSessionTitleExtension(pi)
  await pi.dispatch('session_start', { reason: 'startup' })
  await prompt(pi, 'App 리팩토링 해줘')
  assert.equal(pi.getSessionName(), '사용자지정')
  assert.deepEqual(pi.events, [])
})

test('ignores the prompt-cache preview without spending the one-shot slot', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  await prompt(pi, 'App 리팩토링 해줘', true)
  assert.equal(pi.getSessionName(), undefined)
  assert.deepEqual(pi.events, [])

  await prompt(pi, 'App 리팩토링 해줘')
  assert.deepEqual(pi.events, [{ type: 'session_info_changed', name: 'App 리팩토링' }])
})

test('leaves meaningless first prompts to Senpi and keeps the slot open', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  for (const text of ['', 'https://example.com/very/long/path?q=1', '/name 사용자지정']) {
    await prompt(pi, text)
  }
  assert.equal(pi.getSessionName(), undefined)
  assert.deepEqual(pi.events, [])

  await prompt(pi, 'App 리팩토링 해줘')
  assert.deepEqual(pi.events, [{ type: 'session_info_changed', name: 'App 리팩토링' }])
})

test('does not title after a reload', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  await pi.dispatch('session_start', { reason: 'reload' })
  await prompt(pi, 'App 리팩토링 해줘')
  assert.equal(pi.getSessionName(), undefined)
  assert.deepEqual(pi.events, [])
})

test('does not title after a resume', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  await pi.dispatch('session_start', { reason: 'resume', previousSessionFile: '/tmp/prev.jsonl' })
  await prompt(pi, 'App 리팩토링 해줘')
  assert.equal(pi.getSessionName(), undefined)
  assert.deepEqual(pi.events, [])
})

test('does not register outside an Orca pane', () => {
  setOrcaEnv({ terminalHandle: 'term_qa', ownerPid: String(process.pid) })
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  assert.equal(pi.listeners.size, 0)
})

test('does not register without an Orca terminal handle', () => {
  setOrcaEnv({ paneKey: 'tab_qa:leaf_qa', ownerPid: String(process.pid) })
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  assert.equal(pi.listeners.size, 0)
})

test('does not register in a child agent that inherited the pane', () => {
  setOrcaEnv({ paneKey: 'tab_qa:leaf_qa', terminalHandle: 'term_qa', ownerPid: '99999999' })
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  assert.equal(pi.listeners.size, 0)
})

test('ignores a duplicate registration of the same runner', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  shortSessionTitleExtension(pi)
  assert.equal(pi.registered('session_start'), 1)
  assert.equal(pi.registered('before_agent_start'), 1)

  await pi.dispatch('session_start', { reason: 'startup' })
  await prompt(pi, 'App 리팩토링 해줘')
  assert.deepEqual(pi.events, [{ type: 'session_info_changed', name: 'App 리팩토링' }])
})

test('binds a replacement runner after reload and still names the next new session', async () => {
  enterOrcaHost()
  const original = fakePi()
  shortSessionTitleExtension(original)
  await original.dispatch('session_start', { reason: 'startup' })
  await prompt(original, 'App 리팩토링 해줘')
  assert.deepEqual(original.events, [{ type: 'session_info_changed', name: 'App 리팩토링' }])

  // `/reload` builds a replacement runner in the same process. The replacement
  // must bind its own handlers, and the reloaded session keeps its name.
  const replacement = fakePi('App 리팩토링')
  shortSessionTitleExtension(replacement)
  assert.equal(replacement.registered('before_agent_start'), 1)
  assert.equal(replacement.registered('session_start'), 1)
  await replacement.dispatch('session_start', { reason: 'reload' })
  await prompt(replacement, 'App 리팩토링 해줘')
  assert.equal(replacement.getSessionName(), 'App 리팩토링')
  assert.deepEqual(replacement.events, [])

  // The same retained runner then starts a `new` session: it gets exactly one
  // name, and a second `new` session in that runner gets exactly one too.
  await replacement.dispatch('session_start', { reason: 'new', previousSessionFile: '/tmp/previous.jsonl' })
  replacement.forgetName()
  await prompt(replacement, 'Desktop UI 추가구현')
  assert.equal(replacement.getSessionName(), 'Desktop UI 추가구현')

  await replacement.dispatch('session_start', { reason: 'new', previousSessionFile: '/tmp/previous.jsonl' })
  replacement.forgetName()
  await prompt(replacement, '탭 제목 추가구현')
  assert.equal(replacement.getSessionName(), '탭 제목 추가구현')
  assert.deepEqual(replacement.events, [
    { type: 'session_info_changed', name: 'Desktop UI 추가구현' },
    { type: 'session_info_changed', name: '탭 제목 추가구현' }
  ])

  await prompt(replacement, '또 다른 작업')
  assert.equal(replacement.events.length, 2)
})

test('does not react to its own title event and never undoes a later manual name', async () => {
  enterOrcaHost()
  const pi = fakePi()
  shortSessionTitleExtension(pi)
  await prompt(pi, 'App 리팩토링 해줘')
  assert.equal(pi.registered('session_info_changed'), 0)

  pi.setSessionName('사용자지정')
  assert.equal(pi.getSessionName(), '사용자지정')
  await prompt(pi, '또 다른 작업 시작')
  assert.equal(pi.getSessionName(), '사용자지정')
  assert.deepEqual(pi.events, [
    { type: 'session_info_changed', name: 'App 리팩토링' },
    { type: 'session_info_changed', name: '사용자지정' }
  ])
})

test('first prompt updates the OmO name and its owning Orca tab once', async () => {
  enterOrcaHost()
  const directory = await mkdtemp(join(tmpdir(), 'short-title-orca-'))
  const logPath = join(directory, 'calls.log')
  const originalPath = process.env.PATH
  const originalLog = process.env.ORCA_TEST_ORCA_LOG
  const originalTitle = process.env.ORCA_TEST_ORCA_TITLE
  try {
    const command = join(directory, 'orca')
    await writeFile(
      command,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$ORCA_TEST_ORCA_LOG"\nprintf \'{"ok":true,"result":{"terminal":{"title":"%s"}}}\\n\' "$ORCA_TEST_ORCA_TITLE"\n'
    )
    await chmod(command, 0o755)
    process.env.PATH = `${directory}:${originalPath}`
    process.env.ORCA_TEST_ORCA_LOG = logPath
    process.env.ORCA_TEST_ORCA_TITLE = '{agent}'

    const titles = []
    const ctx = { ui: { setTitle: (title) => titles.push(title) } }
    const listeners = new Map()
    const pending = []
    let name
    const pi = {
      on(event, handler) {
        const handlers = listeners.get(event) ?? []
        handlers.push(handler)
        listeners.set(event, handlers)
      },
      getSessionName() {
        return name
      },
      setSessionName(next) {
        name = next
        for (const handler of listeners.get('session_info_changed') ?? []) {
          pending.push(handler({ type: 'session_info_changed', name }, ctx))
        }
      }
    }
    const { default: titlebar } = await import(`../extensions/orca-titlebar-spinner.ts?composite=${Date.now()}`)
    titlebar(pi)
    shortSessionTitleExtension(pi)
    for (const handler of listeners.get('session_start') ?? []) await handler({ reason: 'startup' }, ctx)
    for (const handler of listeners.get('before_agent_start') ?? []) {
      await handler({ prompt: 'App 리팩토링 해줘', preview: false }, ctx)
    }
    await Promise.all(pending)
    assert.equal(name, 'App 리팩토링')
    assert.equal(titles.at(-1), '{App 리팩토링}')
    let renames = (await readFile(logPath, 'utf8')).split('\n').filter((line) => line.startsWith('terminal rename'))
    assert.deepEqual(renames, ['terminal rename --terminal term_qa --title App 리팩토링 --json'])

    for (const handler of listeners.get('before_agent_start') ?? []) {
      await handler({ prompt: '다음 작업', preview: false }, ctx)
    }
    await Promise.all(pending)
    renames = (await readFile(logPath, 'utf8')).split('\n').filter((line) => line.startsWith('terminal rename'))
    assert.equal(renames.length, 1)

    pi.setSessionName('사용자지정')
    await Promise.all(pending)
    renames = (await readFile(logPath, 'utf8')).split('\n').filter((line) => line.startsWith('terminal rename'))
    assert.deepEqual(renames, [
      'terminal rename --terminal term_qa --title App 리팩토링 --json',
      'terminal rename --terminal term_qa --title 사용자지정 --json'
    ])
  } finally {
    process.env.PATH = originalPath
    if (originalLog === undefined) delete process.env.ORCA_TEST_ORCA_LOG
    else process.env.ORCA_TEST_ORCA_LOG = originalLog
    if (originalTitle === undefined) delete process.env.ORCA_TEST_ORCA_TITLE
    else process.env.ORCA_TEST_ORCA_TITLE = originalTitle
    await rm(directory, { recursive: true, force: true })
  }
})
