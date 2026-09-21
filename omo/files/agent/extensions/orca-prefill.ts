// @orca-managed-pi-extension
export default function (pi) {
  const extensionKey = Symbol.for('orca-pi-prefill-extension')
  if (globalThis[extensionKey]) return
  globalThis[extensionKey] = true
  const ownerPid = process.env.ORCA_PI_PREFILL_OWNED
  const selfPid = String(process.pid)
  if (ownerPid && ownerPid !== selfPid) return
  process.env.ORCA_PI_PREFILL_OWNED = selfPid
  pi.on('session_start', async (event, ctx) => {
    if (!process.env.ORCA_PANE_KEY) return
    if (event.reason !== 'startup') return
    const prefill = process.env.ORCA_PI_PREFILL
    if (!prefill) return
    delete process.env.ORCA_PI_PREFILL
    try {
      ctx.ui.setEditorText(prefill)
    } catch {}
  })
}
