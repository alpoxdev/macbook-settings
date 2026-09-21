#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { inspectAdapter } from '../lib/doctor.mjs'
import { buildOmoArgs, clearStalePiOwnership, hasOrcaPane, resolveOmoBinary } from '../lib/launcher.mjs'

const homeDir = homedir()
const localBinDir = join(homeDir, '.local', 'bin')
const omoPath = resolveOmoBinary(join(localBinDir, 'omo'), localBinDir)

if (hasOrcaPane()) {
  const report = await inspectAdapter({
    homeDir,
    cwd: process.cwd(),
    omoPath,
    argv: process.argv.slice(2),
    versions: {
      orca: process.env.ORCA_VERSION ?? '1.4.192',
      omo: '5.0.0-0.beta.26',
      senpi: '2026.8.28-2'
    }
  })
  if (!report.healthy) {
    console.error(`orca-pi adapter refused to start: ${report.errors.join('; ')}`)
    process.exit(1)
  }
  clearStalePiOwnership(process.env)
}

const result = spawnSync(omoPath, buildOmoArgs(process.argv.slice(2)), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
})

if (result.error) throw result.error
if (result.signal) process.kill(process.pid, result.signal)
process.exit(result.status ?? 1)
