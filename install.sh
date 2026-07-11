#!/usr/bin/env bash
# Symlinks this repo's config into place. Safe to re-run.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

link() {
  local src="$1" dst="$2"
  if [[ -e "$dst" && ! -L "$dst" ]]; then
    mv "$dst" "$dst.bak.$(date +%Y%m%d%H%M%S)"
    echo "Backed up existing $dst"
  fi
  ln -sfn "$src" "$dst"
  echo "Linked $dst -> $src"
}

mkdir -p "$HOME/.config"

# zsh
link "$REPO_DIR/zsh/conf.d" "$HOME/.config/zsh"
link "$REPO_DIR/zsh/zshrc" "$HOME/.zshrc"
link "$REPO_DIR/zsh/zprofile" "$HOME/.zprofile"
link "$REPO_DIR/zsh/zshenv" "$HOME/.zshenv"

LOCAL="$HOME/.config/zsh-local/90-local.zsh"
if [[ ! -e "$LOCAL" ]]; then
  mkdir -p "$HOME/.config/zsh-local"
  cat > "$LOCAL" <<'EOF'
# Machine-local, not synced via git.
EOF
  echo "Created machine-local override at $LOCAL (edit freely, never synced)"
fi
ln -sfn "$HOME/.config/zsh-local/90-local.zsh" "$HOME/.config/zsh/90-local.zsh"

# ghostty
link "$REPO_DIR/ghostty" "$HOME/.config/ghostty"

# orca
mkdir -p "$HOME/.orca"
link "$REPO_DIR/orca/agent-hooks" "$HOME/.orca/agent-hooks"

echo "Done. Restart your shell or run: exec zsh"
