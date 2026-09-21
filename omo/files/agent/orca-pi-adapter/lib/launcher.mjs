import { lstatSync, realpathSync } from 'node:fs'
import { basename, resolve } from 'node:path'

export function hasOrcaPane(env = process.env) {
  return typeof env.ORCA_PANE_KEY === 'string' && env.ORCA_PANE_KEY.length > 0
}

export function buildOmoArgs(argv) {
  const args = [...argv]
  const beforeSeparator = args.indexOf('--') === -1 ? args : args.slice(0, args.indexOf('--'))
  const hasFlag = (shortFlag, longFlag) => beforeSeparator.some((arg) => arg === shortFlag || arg === longFlag || arg.startsWith(`${longFlag}=`))
  const defaults = []
  if (!hasFlag('-p', '--provider')) defaults.push('--provider', 'opencodex')
  if (!hasFlag('-m', '--model')) defaults.push('--model', 'gpt-5.6-luna')
  if (!hasFlag('-t', '--thinking')) defaults.push('--thinking', 'high')
  return [...defaults, ...args]
}

export function clearStalePiOwnership(env) {
  delete env.ORCA_PI_STATUS_OWNED
  delete env.ORCA_PI_TITLE_OWNED
  delete env.ORCA_PI_PREFILL_OWNED
}

export function resolveOmoBinary(path, localBinDir) {
  const launcher = resolve(path)
  const expectedDirectory = realpathSync(resolve(localBinDir))
  const launcherDirectory = realpathSync(resolve(launcher, '..'))
  const rawPackageBin = resolve(expectedDirectory, '..', 'lib', 'node_modules', 'omo-ai', 'bin')
  let trustedPackageBin = rawPackageBin
  try {
    trustedPackageBin = realpathSync(rawPackageBin)
  } catch {
    // A missing package-bin cannot be trusted, but should still yield the
    // normal trusted-path rejection below instead of leaking an ENOENT detail.
  }
  if (launcherDirectory !== expectedDirectory) {
    throw new Error('OMO binary must be an approved direct child of the local bin directory')
  }
  const launcherStats = lstatSync(launcher)
  if (!launcherStats.isFile() && !launcherStats.isSymbolicLink()) {
    throw new Error('OMO launcher must be a regular file or symlink')
  }
  if (launcherStats.uid !== process.getuid()) {
    throw new Error('OMO launcher must be owned by the current user')
  }
  const resolved = realpathSync(launcher)
  if (!resolved.startsWith(`${expectedDirectory}/`) && !resolved.startsWith(`${trustedPackageBin}/`)) {
    throw new Error('OMO launcher target must stay inside a trusted local bin path')
  }
  const stats = lstatSync(resolved)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('OMO target must be a regular file')
  }
  if (stats.uid !== process.getuid() || stats.nlink !== 1) {
    throw new Error('OMO binary must be solely owned by the current user')
  }
  if (basename(resolved) === 'pi') {
    throw new Error('OMO binary must not recurse into the Pi launcher')
  }
  return resolved
}
