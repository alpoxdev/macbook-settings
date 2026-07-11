# Oh My Zsh and interactive plugins.
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="agnoster"
plugins=(git autojump)

# Avoid startup update-check cost; update manually with `omz update` when desired.
DISABLE_AUTO_UPDATE=true
# Skip per-shell compaudit security scan; re-run `compaudit` manually after plugin/path changes.
ZSH_DISABLE_COMPFIX=true
zstyle ':omz:update' mode disabled

# Keep completion dump in a stable cache location.
ZSH_COMPDUMP="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/.zcompdump-${HOST}-${ZSH_VERSION}"
mkdir -p "${ZSH_COMPDUMP:h}"

source "$ZSH/oh-my-zsh.sh"

# External interactive plugins. Syntax highlighting should stay after other plugins.
[[ -r /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]] && source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
[[ -r /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
