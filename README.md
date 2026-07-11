# macbook-settings

Personal machine config, shared across machines (MacBook, Mac mini).

## Layout

- `zsh/zshrc`, `zsh/zprofile`, `zsh/zshenv` — symlinked to `~/.zshrc`, `~/.zprofile`, `~/.zshenv`
- `zsh/conf.d/` — symlinked to `~/.config/zsh`, loaded in order by `zshrc`
- `ghostty/` — symlinked to `~/.config/ghostty` (Ghostty terminal config)
- `orca/agent-hooks/` — symlinked to `~/.orca/agent-hooks` (Orca agent hook scripts)
- `orca/appearance.json` — Orca's appearance/theme/font settings (theme, sidebar
  tint, terminal font/theme/cursor/opacity, etc.), applied with
  `orca/apply-appearance.py` (see below)
- Machine-local, non-synced overrides live in `~/.config/zsh-local/90-local.zsh`
  (symlinked to `~/.config/zsh/90-local.zsh`, never committed to this repo)

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

Then, to apply the Orca appearance settings: quit Orca, launch it once so
`orca-data.json` exists, quit it again, and run:

```bash
python3 ~/macbook-settings/orca/apply-appearance.py
```

This merges only the appearance keys into your settings (a `.bak.pre-appearance`
backup of the original file is made first) — it never touches repos, worktrees,
or other per-machine state. Re-run it any time `orca/appearance.json` changes.

## Sync changes

```bash
cd ~/macbook-settings
git add -A && git commit -m "update config" && git push
# on the other machine
cd ~/macbook-settings && git pull
```
