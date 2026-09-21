import { lstat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { homedir, userInfo } from 'node:os'
import { createHash } from 'node:crypto'

export const MANAGED_EXTENSION_FILES = [
  'orca-agent-status.ts',
  'omo-supervision-reporter.ts',
  'orca-prefill.ts',
  'orca-titlebar-spinner.ts'
]

const MANAGED_MARKER = '@orca-managed-pi-extension'
const REQUIRED_DIRECTORY_MODE_MASK = 0o022

function fileMode(stats) {
  return stats.mode & 0o777
}

function relativeToHome(path, homeDir) {
  return path.startsWith(`${homeDir}/`) ? `~/${path.slice(homeDir.length + 1)}` : path
}

async function inspectDirectory(path, label) {
  try {
    const stats = await lstat(path)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return { label, path, healthy: false, error: 'must be a real directory' }
    }
    if (stats.uid !== process.getuid()) {
      return { label, path, healthy: false, error: 'must be owned by the current user' }
    }
    if ((fileMode(stats) & REQUIRED_DIRECTORY_MODE_MASK) !== 0) {
      return { label, path, healthy: false, error: 'must not be group/world writable' }
    }
    return { label, path, healthy: true }
  } catch (error) {
    return { label, path, healthy: false, error: error.code ?? String(error) }
  }
}

async function inspectManagedExtension(path) {
  const name = path.split('/').at(-1)
  try {
    const [stats, source] = await Promise.all([lstat(path), readFile(path, 'utf8')])
    const errors = []
    if (!stats.isFile() || stats.isSymbolicLink()) errors.push('must be a regular file')
    if (stats.uid !== process.getuid()) errors.push('must be owned by the current user')
    if (stats.nlink !== 1) errors.push('must have exactly one hard link')
    if ((fileMode(stats) & REQUIRED_DIRECTORY_MODE_MASK) !== 0) {
      errors.push('must not be group/world writable')
    }
    if (!source.includes(MANAGED_MARKER)) errors.push('missing managed marker')
    return {
      name,
      path,
      sha256: createHash('sha256').update(source).digest('hex'),
      healthy: errors.length === 0,
      errors
    }
  } catch (error) {
    return { name, path, healthy: false, errors: [error.code ?? String(error)] }
  }
}

export function parseExplicitExtensionPaths(argv) {
  const paths = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') break
    if (arg === '-e' || arg === '--extension') {
      const value = argv[index + 1]
      if (value) paths.push(value)
      index += 1
      continue
    }
    if (arg.startsWith('--extension=')) paths.push(arg.slice('--extension='.length))
  }
  return paths
}

export async function inspectAdapter({
  homeDir = homedir(),
  cwd = process.cwd(),
  omoPath = join(homeDir, '.local', 'bin', 'omo'),
  argv = [],
  versions = {}
} = {}) {
  const agentDir = join(homeDir, '.omo', 'agent')
  const extensionsDir = join(agentDir, 'extensions')
  const adapterDir = join(agentDir, 'orca-pi-adapter')
  const localBinDir = dirname(omoPath)
  const directories = await Promise.all([
    inspectDirectory(join(homeDir, '.omo'), 'omo-home'),
    inspectDirectory(agentDir, 'omo-agent'),
    inspectDirectory(extensionsDir, 'global-extensions'),
    inspectDirectory(adapterDir, 'adapter'),
    inspectDirectory(localBinDir, 'local-bin')
  ])
  const globalExtensions = await Promise.all(
    MANAGED_EXTENSION_FILES.map((file) => inspectManagedExtension(join(extensionsDir, file)))
  )
  const explicit = parseExplicitExtensionPaths(argv).map((entry) => resolve(cwd, entry))
  const projectLocal = join(cwd, '.omo', 'extensions')
  const duplicateManagedExtensions = []
  for (const candidate of [projectLocal, ...explicit]) {
    if (candidate === extensionsDir) continue
    for (const file of MANAGED_EXTENSION_FILES) {
      try {
        const source = await readFile(join(candidate, file), 'utf8')
        if (source.includes(MANAGED_MARKER)) {
          duplicateManagedExtensions.push({ location: relativeToHome(candidate, homeDir), file })
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          duplicateManagedExtensions.push({ location: relativeToHome(candidate, homeDir), file, error: error.code })
        }
      }
    }
  }
  const errors = [
    ...directories.filter((entry) => !entry.healthy).map((entry) => `${entry.label}: ${entry.error}`),
    ...globalExtensions.flatMap((entry) => entry.errors?.map((error) => `${entry.name}: ${error}`) ?? [])
  ]
  return {
    healthy: errors.length === 0,
    user: userInfo().username,
    versions,
    directories,
    globalExtensionDir: extensionsDir,
    globalExtensions,
    explicitExtensionPaths: explicit.map((path) => relativeToHome(path, homeDir)),
    duplicateManagedExtensions,
    errors
  }
}
