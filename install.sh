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
link "$REPO_DIR/zsh" "$HOME/.config/zsh"
link "$REPO_DIR/zshrc" "$HOME/.zshrc"
link "$REPO_DIR/zprofile" "$HOME/.zprofile"
link "$REPO_DIR/zshenv" "$HOME/.zshenv"

LOCAL="$HOME/.config/zsh-local/90-local.zsh"
if [[ ! -e "$LOCAL" ]]; then
  mkdir -p "$HOME/.config/zsh-local"
  cat > "$LOCAL" <<'EOF'
# Machine-local, not synced via git.
EOF
  echo "Created machine-local override at $LOCAL (edit freely, never synced)"
fi
ln -sfn "$HOME/.config/zsh-local/90-local.zsh" "$HOME/.config/zsh/90-local.zsh"

echo "Done. Restart your shell or run: exec zsh"
