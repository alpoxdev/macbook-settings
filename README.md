# macbook-settings

Personal machine config, shared across machines (MacBook, Mac mini).

## Layout

- `zsh/zshrc`, `zsh/zprofile`, `zsh/zshenv` — symlinked to `~/.zshrc`, `~/.zprofile`, `~/.zshenv`
- `zsh/conf.d/` — symlinked to `~/.config/zsh`, loaded in order by `zshrc`
- `ghostty/` — symlinked to `~/.config/ghostty` (Ghostty terminal config)
- `ghostty/config-macos` — symlinked to `~/Library/Application Support/com.mitchellh.ghostty/config`,
  the second file macOS Ghostty loads (after the one above, so it wins on
  conflicting keys: `background`, `cursor-color`, `font-size`)
- `orca/agent-hooks/` — symlinked to `~/.orca/agent-hooks` (Orca agent hook scripts)
- `orca/appearance.json` — Orca's appearance/theme/font settings (theme, sidebar
  tint, terminal font/theme/cursor/opacity, etc.), applied with
  `orca/apply-appearance.py` (see below)
- Machine-local, non-synced overrides live in `~/.config/zsh-local/90-local.zsh`
  (symlinked to `~/.config/zsh/90-local.zsh`, never committed to this repo)
- `omo/` — the OMO (`~/.omo`) config, copied into `omo/files/` by `omo/backup.sh`
  instead of symlinked (see below)

Orca's `~/Library/Application Support/orca/orca-data.json` is a live per-machine
app database (repos, worktrees, ssh targets, a session cookie, ...), so it is
never synced or symlinked wholesale — only the appearance keys are extracted
into `orca/appearance.json`.

## Install on a new machine

```bash
git clone https://github.com/alpoxdev/macbook-settings.git ~/macbook-settings
~/macbook-settings/install.sh
exec zsh
```

Then, to apply the Orca appearance settings: quit Orca, launch it once so its
settings file exists, quit it again, and run:

```bash
python3 ~/macbook-settings/orca/apply-appearance.py
```

This merges only the appearance keys into your settings (a `.bak.pre-appearance`
backup of the original file is made first) — it never touches repos, worktrees,
or other per-machine state. Re-run it any time `orca/appearance.json` changes.
The script targets the file Orca actually writes
(`profiles/<profile>/orca-data.json` on 1.4.x, top-level `orca-data.json` on
older installs) and prints which one it picked.

## Fonts (not synced)

These settings name fonts that must be installed on each machine:

- **Jetendard** — Ghostty `font-family`, Orca `terminalFontFamily` and
  `editorFontFamily`. Install into `~/Library/Fonts` (16 `.ttf` weights).
- **Geist** — Orca `appFontFamily`, ships with Orca itself, nothing to install.

Without Jetendard both terminals silently fall back to a default font.

## OMO config (`omo/`)

```bash
~/macbook-settings/omo/backup.sh              # ~/.omo -> omo/files/
~/macbook-settings/omo/backup.sh --restore    # omo/files/ -> ~/.omo
```

A copy, not a symlink: OMO rewrites `settings.json` and `models-store.json` while it
runs, and keeps conversation history in the same tree, so linking the live files
would leave the repo permanently dirty. Run `backup.sh`, commit, push.

Included: `omo.jsonc`, `settings.json`, `mcp.json`, `config.jsonc`, `models-store.json`,
`trust.json`, `rules/`, and the agent-side equivalents (`agent/settings.json`,
`agent/models.json`, `agent/extensions/`, `agent/orca-pi-adapter/{bin,lib,test}`,
the three `agent/*.js` title hooks).

Deliberately excluded: conversation history (`sessions/`, `memory/agents/*/runtime/`),
logs, caches, `tmp/`, regenerated indexes (`codegraph/`, `npm/`, `lsp-daemon/`),
installed binaries (`bin/fd`), and every `*.bak.*` / `backups/` /
`migration-backup-*` / `repairs/` archive. Patch and editor leftovers that sit next to
real files (`*.orig`, `*.rej`, `*~`) are deleted from the copy.

**Credentials never leave the machine.** `auth.json`, `agent/auth.json`,
`agent/mcp-auth/`, and `agent/credential-pool-state.json` are not in the list at all,
and the `Authorization: Bearer ...` values inside `mcp.json` / `agent/mcp.json` are
rewritten to `Bearer REDACTED` on the way in. This repo is public. The script refuses
to finish if a credential-shaped value survives anywhere under `omo/files/`. After a
restore, re-authenticate the MCP servers that used those tokens.

Still local-only: the agent memory repo at `~/.omo/memory/agents/*/repo` (personal
notes, no remote) — it is not copied here because this repo is public.

## Sync changes

```bash
cd ~/macbook-settings
git add -A && git commit -m "update config" && git push
# on the other machine
cd ~/macbook-settings && git pull
```
