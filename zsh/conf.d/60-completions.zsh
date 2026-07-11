# Optional completions beyond Oh My Zsh.
if [[ -x /opt/homebrew/bin/terraform ]]; then
  autoload -U +X bashcompinit && bashcompinit
  complete -o nospace -C /opt/homebrew/bin/terraform terraform
fi

# Bun completions.
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"
