# zsh-settings

Personal shell + terminal config, shared across machines (MacBook, Mac mini).

## Layout

- `zsh/zshrc`, `zsh/zprofile`, `zsh/zshenv` — symlinked to `~/.zshrc`, `~/.zprofile`, `~/.zshenv`
- `zsh/conf.d/` — symlinked to `~/.config/zsh`, loaded in order by `zshrc`
- `ghostty/` — symlinked to `~/.config/ghostty` (Ghostty terminal config)
- Machine-local, non-synced overrides live in `~/.config/zsh-local/90-local.zsh`
  (symlinked to `~/.config/zsh/90-local.zsh`, never committed to this repo)

## Install on a new machine

```bash
git clone https://github.com/alpoxdev/zsh-settings.git ~/zsh-settings
~/zsh-settings/install.sh
exec zsh
```

## Sync changes

```bash
cd ~/zsh-settings
git add -A && git commit -m "update config" && git push
# on the other machine
cd ~/zsh-settings && git pull
```
