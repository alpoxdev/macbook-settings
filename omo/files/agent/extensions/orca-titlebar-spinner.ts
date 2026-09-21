// @orca-managed-pi-extension
const BRAILLE_FRAMES = [
  '\u280b',
  '\u2819',
  '\u2839',
  '\u2838',
  '\u283c',
  '\u2834',
  '\u2826',
  '\u2827',
  '\u2807',
  '\u280f'
]

const FRAME_INTERVAL_MS = 500

declare const process: any
declare const require: (name: string) => any

function getNodeBuiltin(name: string): any {
  const builtin = process.getBuiltinModule?.(name) ?? process.getBuiltinModule?.(`node:${name}`)
  if (builtin) return builtin
  try {
    return require(name)
  } catch {
    return null
  }
}

// `terminal show` returns this terminal's pane title. Tab titles are exposed
// separately by `terminal list --include-visual-layouts`, and this extension
// must never write the shared tab title.
function getOrcaPaneTitle(): string | null {
  const terminal = process.env.ORCA_TERMINAL_HANDLE
  if (!terminal) return null
  try {
    const childProcess = getNodeBuiltin('child_process')
    const output = childProcess?.execFileSync('orca', ['terminal', 'show', '--terminal', terminal, '--json'], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const title = JSON.parse(String(output)).result?.terminal?.title
    return typeof title === 'string' ? title : null
  } catch {
    return null
  }
}

function renameOrcaTab(title: string): void {
  const terminal = process.env.ORCA_TERMINAL_HANDLE
  if (!terminal) return
  try {
    const childProcess = getNodeBuiltin('child_process')
    childProcess?.execFileSync('orca', ['terminal', 'rename', '--terminal', terminal, '--title', `{${title}}`, '--json'], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'ignore', 'ignore']
    })
  } catch {
    // Session naming must not fail if the Orca runtime is unavailable.
  }
}

function isManagedTitle(title: unknown): title is string {
  return typeof title === 'string' && title.startsWith('{') && title.endsWith('}')
}

function getPaneTitleOverride(): string | null {
  const paneKey = process.env.ORCA_PANE_KEY
  const home = process.env.HOME
  if (!paneKey || !home) return null
  try {
    const fs = getNodeBuiltin('fs')
    const fileName = `${paneKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
    const path = `${home}/.omo/agent/pane-title-overrides/${fileName}`
    const override = JSON.parse(String(fs?.readFileSync(path, 'utf8')))
    if (override?.paneKey !== paneKey || typeof override?.title !== 'string') return null
    const title = override.title.trim()
    return title && title.length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/.test(title) ? title : null
  } catch {
    return null
  }
}

function getWorkingDirectoryBasename(): string {
  return process.cwd().split(/[\\/]/).filter(Boolean).at(-1) || process.cwd()
}

function isAutomaticOrcaPasteTitle(title: unknown): title is string {
  return typeof title === 'string' && /(?:^|[\\/])orca-paste-\d+-[0-9a-f-]+\.[a-z0-9]+$/i.test(title)
}

function isAutomaticSenpiTitle(title: unknown, baseTitle: string): title is string {
  if (typeof title !== 'string') return false
  const cwd = getWorkingDirectoryBasename()
  return title === `OmO - ${baseTitle}` || title === `OmO - ${baseTitle} - ${cwd}`
}

function getBaseTitle(pi: any): string {
  return pi.getSessionName() || getWorkingDirectoryBasename()
}

export default function (pi: any) {
  if (!process.env.ORCA_PANE_KEY) return
  // Senpi recreates extension runners for `/reload` in the same process. The
  // PID ownership check still excludes inherited child-agent registrations,
  // while allowing the replacement runner to bind its fresh event handlers.
  const ownerPid = process.env.ORCA_PI_TITLE_OWNED
  const selfPid = String(process.pid)
  if (ownerPid && ownerPid !== selfPid) return
  process.env.ORCA_PI_TITLE_OWNED = selfPid
  let timer: ReturnType<typeof setInterval> | null = null
  let frameIndex = 0

  function clearAnimation(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    frameIndex = 0
  }

  function setManagedTitle(ctx: any, baseTitle: string, frame?: string, allowAutomaticTitle = false): boolean {
    const override = getPaneTitleOverride()
    if (override) {
      ctx.ui.setTitle(`{${frame ? `${frame} ` : ''}${override}}`)
      return true
    }
    const title = frame ? `${frame} ${baseTitle}` : baseTitle
    const livePaneTitle = getOrcaPaneTitle()
    if (
      !isManagedTitle(livePaneTitle) &&
      !(allowAutomaticTitle && (isAutomaticSenpiTitle(livePaneTitle, baseTitle) || isAutomaticOrcaPasteTitle(livePaneTitle)))
    ) {
      return false
    }
    ctx.ui.setTitle(`{${title}}`)
    return true
  }

  function renderFrame(ctx: any): boolean {
    const frame = BRAILLE_FRAMES[frameIndex % BRAILLE_FRAMES.length]
    if (!setManagedTitle(ctx, getBaseTitle(pi), frame)) return false
    frameIndex++
    return true
  }

  function stopAnimation(ctx: any): void {
    clearAnimation()
    setManagedTitle(ctx, getBaseTitle(pi))
  }

  function startAnimation(ctx: any): void {
    clearAnimation()
    if (!renderFrame(ctx)) return
    timer = setInterval(() => {
      if (!renderFrame(ctx)) clearAnimation()
    }, FRAME_INTERVAL_MS)
  }

  pi.on('session_start', async (event: { reason?: unknown }, ctx: any) => {
    if (event.reason !== 'startup' && event.reason !== 'reload') return
    // Only claim titles that Senpi or Orca created. An arbitrary unbraced title
    // is a user rename and must remain untouched. A pane-scoped override is
    // explicit user intent and is reapplied immediately after `/reload`.
    if (setManagedTitle(ctx, getBaseTitle(pi), undefined, true)) return
    // InteractiveMode writes Senpi's normal title after synchronous startup
    // handlers finish, so retry once on the next task after that writer runs.
    setTimeout(() => {
      setManagedTitle(ctx, getBaseTitle(pi), undefined, true)
    }, 0)
  })

  pi.on('session_info_changed', async (_event: unknown, ctx: any) => {
    const sessionName = pi.getSessionName()
    if (typeof sessionName === 'string' && sessionName) renameOrcaTab(sessionName)
    const wasAnimating = timer !== null
    const baseTitle = getBaseTitle(pi)
    if (!setManagedTitle(ctx, baseTitle, undefined, true)) {
      clearAnimation()
      return
    }
    if (wasAnimating) startAnimation(ctx)
  })

  pi.on('agent_start', async (_event: unknown, ctx: any) => {
    startAnimation(ctx)
  })

  pi.on('agent_end', async (_event: unknown) => {
    // Senpi emits agent_settled after retries, compaction, and queued work.
    // agent_end is therefore not evidence that this Orca pane is idle.
  })

  pi.on('agent_settled', async (_event: unknown, ctx: any) => {
    stopAnimation(ctx)
  })

  pi.on('session_shutdown', async (_event: unknown, ctx: any) => {
    stopAnimation(ctx)
  })
}
