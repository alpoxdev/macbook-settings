#!/usr/bin/env node
import { chmod, lstat, open, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const MARKER = 'orca-pi-omo-managed-launcher'
const homeDir = homedir()
const target = join(homeDir, '.local', 'bin', 'pi')
const adapterLauncherUrl = new URL('./pi.mjs', import.meta.url).href

async function assertSafeDirectory(path) {
  const stats = await lstat(path)
  if (!stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== process.getuid() || (stats.mode & 0o022) !== 0) {
    throw new Error(`unsafe directory: ${path}`)
  }
}

await assertSafeDirectory(join(homeDir, '.local'))
await assertSafeDirectory(dirname(target))

try {
  await lstat(target)
  throw new Error(`refusing to replace existing launcher: ${target}`)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const handle = await open(target, 'wx', 0o700)
try {
  await handle.writeFile(
    `#!/usr/bin/env node\n// ${MARKER}\nawait import(${JSON.stringify(adapterLauncherUrl)})\n`,
    'utf8'
  )
  await handle.sync()
} catch (error) {
  await handle.close()
  await unlink(target).catch(() => {})
  throw error
}
await handle.close()
await chmod(target, 0o700)
const stats = await lstat(target)
if (!stats.isFile() || stats.isSymbolicLink() || stats.uid !== process.getuid() || stats.nlink !== 1 || (stats.mode & 0o777) !== 0o700) {
  await unlink(target).catch(() => {})
  throw new Error('launcher post-install verification failed')
}
console.log(target)
