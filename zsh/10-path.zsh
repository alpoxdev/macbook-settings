# Centralized PATH policy. Keep order intentional and deduplicated.
typeset -gU path PATH

_zsh_path_prepend_ordered() {
  local dir
  local -a dirs
  for dir in "$@"; do
    [[ -d "$dir" ]] && dirs+=("$dir")
  done
  path=("${dirs[@]}" "${path[@]}")
  typeset -gU path PATH
}

# Java 설정 (Zulu JDK 17) — previous ~/.zshrc value wins over older ~/.zshenv JDK 22 value.
export JAVA_HOME="/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home"

export BUN_INSTALL="$HOME/.bun"
export PNPM_HOME="$HOME/Library/pnpm"
export GEM_HOME="$HOME/.gem"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NVM_DIR="$HOME/.nvm"

_zsh_path_prepend_ordered \
  "$HOME/.local/bin" \
  "$PNPM_HOME" \
  "$HOME/.opencode/bin" \
  "/opt/homebrew/opt/node@24/bin" \
  "$HOME/.antigravity/antigravity/bin" \
  "$BUN_INSTALL/bin" \
  "$HOME/.rbenv/shims" \
  "$HOME/bin" \
  "/opt/homebrew/bin" \
  "/opt/homebrew/sbin" \
  "/usr/local/bin" \
  "$JAVA_HOME/bin" \
  "/opt/homebrew/opt/libpq/bin" \
  "/opt/homebrew/opt/openssl@3/bin" \
  "/opt/homebrew/opt/ruby/bin" \
  "$HOME/.gem/bin" \
  "$HOME/.yarn/bin" \
  "$HOME/.config/yarn/global/node_modules/.bin" \
  "$HOME/.cargo/bin" \
  "$HOME/.codeium/windsurf/bin" \
  "/Users/alpox/Library/Application Support/JetBrains/Toolbox/scripts" \
  "/Applications/Obsidian.app/Contents/MacOS"

unfunction _zsh_path_prepend_ordered
