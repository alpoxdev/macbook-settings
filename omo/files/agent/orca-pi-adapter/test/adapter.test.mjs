import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile, chmod, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { inspectAdapter, parseExplicitExtensionPaths } from '../lib/doctor.mjs'
import { buildOmoArgs, clearStalePiOwnership, hasOrcaPane, resolveOmoBinary } from '../lib/launcher.mjs'

const MANAGED_FILES = [
  'orca-agent-status.ts',
  'omo-supervision-reporter.ts',
  'orca-prefill.ts',
  'orca-titlebar-spinner.ts'
]

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'orca-pi-adapter-'))
  const agentDir = join(root, '.omo', 'agent')
  const extensionsDir = join(agentDir, 'extensions')
  const adapterDir = join(agentDir, 'orca-pi-adapter')
  const localBinDir = join(root, '.local', 'bin')
  await mkdir(extensionsDir, { recursive: true })
  await mkdir(adapterDir, { recursive: true })
  await mkdir(localBinDir, { recursive: true })
  await chmod(join(root, '.omo'), 0o700)
  await chmod(agentDir, 0o700)
  await chmod(extensionsDir, 0o700)
  await chmod(adapterDir, 0o700)
  await chmod(join(root, '.local'), 0o700)
  await chmod(localBinDir, 0o700)
  for (const file of MANAGED_FILES) {
    await writeFile(join(extensionsDir, file), '// @orca-managed-pi-extension\nexport default function () {}\n', { mode: 0o644 })
  }
  const omoPath = join(localBinDir, 'omo')
  await writeFile(omoPath, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  return { root, agentDir, extensionsDir, localBinDir, omoPath }
}

test('detects only supported explicit extension flags before --', () => {
  assert.deepEqual(
    parseExplicitExtensionPaths(['-e', 'one.ts', '--extension=two.ts', '--extension', 'three.ts', '--', '-e', 'ignored.ts']),
    ['one.ts', 'two.ts', 'three.ts']
  )
})

test('recognizes an Orca pane only when its pane key exists', () => {
  assert.equal(hasOrcaPane({}), false)
  assert.equal(hasOrcaPane({ ORCA_PANE_KEY: '' }), false)
  assert.equal(hasOrcaPane({ ORCA_PANE_KEY: 'pane_1' }), true)
})

test('adds the requested Luna high defaults only when absent', () => {
  assert.deepEqual(buildOmoArgs([]), ['--provider', 'opencodex', '--model', 'gpt-5.6-luna', '--thinking', 'high'])
  assert.deepEqual(
    buildOmoArgs(['--provider', 'openai', '--model', 'other', '--thinking', 'low', 'hello']),
    ['--provider', 'openai', '--model', 'other', '--thinking', 'low', 'hello']
  )
})

test('clears inherited Pi extension ownership before a new Pi process starts', () => {
  const env = {
    ORCA_PI_STATUS_OWNED: 'old',
    ORCA_PI_TITLE_OWNED: 'old',
    ORCA_PI_PREFILL_OWNED: 'old',
    ORCA_PANE_KEY: 'pane'
  }
  clearStalePiOwnership(env)
  assert.deepEqual(env, { ORCA_PANE_KEY: 'pane' })
})

test('resolves the owned OMO launcher symlink to its regular target', async () => {
  const fixture = await createFixture()
  const packageBin = join(fixture.root, '.local', 'lib', 'node_modules', 'omo-ai', 'bin')
  await mkdir(packageBin, { recursive: true })
  await chmod(join(fixture.root, '.local', 'lib'), 0o700)
  await chmod(join(fixture.root, '.local', 'lib', 'node_modules'), 0o700)
  await chmod(join(fixture.root, '.local', 'lib', 'node_modules', 'omo-ai'), 0o700)
  await chmod(packageBin, 0o700)
  const target = join(packageBin, 'omo.js')
  await writeFile(target, '#!/usr/bin/env node\n', { mode: 0o700 })
  const link = join(fixture.localBinDir, 'omo-link')
  await symlink(target, link)
  assert.equal(resolveOmoBinary(link, fixture.localBinDir), await realpath(target))
})

test('rejects an OMO launcher symlink outside its trusted local bin', async () => {
  const fixture = await createFixture()
  const foreign = join(fixture.root, 'foreign-omo')
  await writeFile(foreign, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  const link = join(fixture.localBinDir, 'omo-link')
  await symlink(foreign, link)
  assert.throws(() => resolveOmoBinary(link, fixture.localBinDir), /trusted local bin/i)
})

test('reports a healthy, single global extension set', async () => {
  const fixture = await createFixture()
  const report = await inspectAdapter({
    homeDir: fixture.root,
    cwd: fixture.root,
    omoPath: fixture.omoPath,
    versions: { orca: '1.4.192', omo: '5.0.0-0.beta.26', senpi: '2026.8.28-2' }
  })
  assert.equal(report.healthy, true)
  assert.equal(report.globalExtensions.every((entry) => entry.healthy), true)
  assert.deepEqual(report.duplicateManagedExtensions, [])
})

test('rejects a managed extension with unsafe permissions', async () => {
  const fixture = await createFixture()
  await chmod(join(fixture.extensionsDir, 'orca-prefill.ts'), 0o666)
  const report = await inspectAdapter({
    homeDir: fixture.root,
    cwd: fixture.root,
    omoPath: fixture.omoPath,
    versions: { orca: '1.4.192', omo: '5.0.0-0.beta.26', senpi: '2026.8.28-2' }
  })
  assert.equal(report.healthy, false)
  assert.match(report.errors.join('\n'), /orca-prefill\.ts.*group\/world writable/i)
})
