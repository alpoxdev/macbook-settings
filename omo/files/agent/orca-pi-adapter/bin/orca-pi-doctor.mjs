#!/usr/bin/env node
import { inspectAdapter } from '../lib/doctor.mjs'

const report = await inspectAdapter({
  argv: process.argv.slice(2),
  versions: {
    orca: process.env.ORCA_VERSION ?? '1.4.192',
    omo: '5.0.0-0.beta.26',
    senpi: '2026.8.28-2'
  }
})

console.log(JSON.stringify(report, null, 2))
process.exitCode = report.healthy ? 0 : 1
