# macbook-settings

Personal machine config, shared across machines (MacBook, Mac mini).

## Layout

- `zsh/zshrc`, `zsh/zprofile`, `zsh/zshenv` — symlinked to `~/.zshrc`, `~/.zprofile`, `~/.zshenv`
- `zsh/conf.d/` — symlinked to `~/.config/zsh`, loaded in order by `zshrc`
- `ghostty/` — symlinked to `~/.config/ghostty` (Ghostty terminal config)
- `orca/agent-hooks/` — symlinked to `~/.orca/agent-hooks` (Orca agent hook scripts;
  Orca's `~/Library/Application Support/orca` is app runtime/cache/secrets and is
  intentionally NOT synced here)
- Machine-local, non-synced overrides live in `~/.config/zsh-local/90-local.zsh`
  (symlinked to `~/.config/zsh/90-local.zsh`, never committed to this repo)

## Install on a new machine

```bash
git clone https://github.com/alpoxdev/macbook-settings.git ~/macbook-settings
~/macbook-settings/install.sh
exec zsh
```

## Sync changes

```bash
cd ~/macbook-settings
git add -A && git commit -m "update config" && git push
# on the other machine
cd ~/macbook-settings && git pull
```
