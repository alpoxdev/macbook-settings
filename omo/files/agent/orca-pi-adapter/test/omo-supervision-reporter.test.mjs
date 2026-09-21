import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { chmod, mkdir, mkdtemp, readFile, watch, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const reporterPath = new URL('../../extensions/omo-supervision-reporter.ts', import.meta.url).href
const originalEnv = { ...process.env }
let importSequence = 0

function reporterModuleUrl(label) {
  importSequence += 1
  return `${reporterPath}?${label}=${process.hrtime.bigint()}-${importSequence}`
}

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
  delete process.env.ORCA_PI_SUPERVISION_OWNED
  delete globalThis[Symbol.for('omo-supervision-reporter-extension')]
}

beforeEach(restoreEnvironment)
afterEach(restoreEnvironment)

function fakePi() {
  const handlers = new Map()
  return { handlers, on(name, handler) { handlers.set(name, handler) } }
}

function dispatchedPrompt() {
  return `Your coordinator's terminal handle is: term_coordinator\nYour task ID is: task_qa\n\n  orca orchestration send --from term_worker \\\n    --type worker_done --task-id task_qa --dispatch-id ctx_qa --outcome succeeded`
}

test('does not report a normal user-owned turn without dispatch context', { concurrency: false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omo-supervision-reporter-'))
  const bin = join(directory, 'bin')
  const log = join(directory, 'orca-log.json')
  await mkdir(bin)
  await writeFile(join(bin, 'orca'), `#!/usr/bin/env node\nconst fs = require('node:fs'); fs.writeFileSync(process.env.ORCA_REPORTER_TEST_LOG, 'unexpected');\n`)
  await chmod(join(bin, 'orca'), 0o700)
  process.env.PATH = `${bin}:${originalEnv.PATH ?? ''}`
  process.env.ORCA_REPORTER_TEST_LOG = log
  process.env.ORCA_PANE_KEY = 'pane_qa'

  const { default: reporter } = await import(reporterModuleUrl('normal'))
  const pi = fakePi()
  reporter(pi)
  pi.handlers.get('before_agent_start')({ prompt: 'ordinary user-owned work' }, {})
  pi.handlers.get('agent_start')({}, {})
  await new Promise((resolve) => setTimeout(resolve, 30))
  await assert.rejects(readFile(log, 'utf8'))
})

test('reports active status only for a freshly parsed dispatch context', { concurrency: false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omo-supervision-reporter-'))
  const bin = join(directory, 'bin')
  const log = join(directory, 'orca-log.json')
  await mkdir(bin)
  await writeFile(join(bin, 'orca'), `#!/usr/bin/env node\nconst fs = require('node:fs'); fs.writeFileSync(process.env.ORCA_REPORTER_TEST_LOG, JSON.stringify(process.argv.slice(2)));\n`)
  await chmod(join(bin, 'orca'), 0o700)
  process.env.PATH = `${bin}:${originalEnv.PATH ?? ''}`
  process.env.ORCA_REPORTER_TEST_LOG = log
  process.env.ORCA_PANE_KEY = 'pane_qa'

  const { default: reporter } = await import(reporterModuleUrl('status'))
  const pi = fakePi()
  reporter(pi)
  assert.equal(pi.handlers.has('before_agent_start'), true)
  assert.equal(pi.handlers.has('agent_start'), true)

  const changes = watch(directory)
  const change = (async () => {
    for await (const event of changes) {
      if (event.filename === 'orca-log.json') return
    }
    throw new Error('watch ended before report')
  })()
  pi.handlers.get('before_agent_start')({ prompt: dispatchedPrompt() }, {})
  pi.handlers.get('agent_start')({}, {})
  try {
    await Promise.race([
      change,
      new Promise((_, reject) => setTimeout(() => reject(new Error('report timeout')), 2000))
    ])
  } finally {
    await changes.return()
  }

  const args = JSON.parse(await readFile(log, 'utf8'))
  assert.deepEqual(args.slice(0, 5), ['orchestration', 'send', '--from', 'term_worker', '--type'])
  assert.equal(args.includes('status'), true)
  assert.equal(args.includes('task_qa'), true)
  assert.equal(args.includes('ctx_qa'), true)
  assert.equal(args.includes('active'), true)
})
