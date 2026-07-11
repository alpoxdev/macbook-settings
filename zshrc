# Interactive zsh entrypoint. Keep heavy setup in ~/.config/zsh modules.
[[ $- != *i* ]] && return

for file in \
  "$HOME/.config/zsh/00-options.zsh" \
  "$HOME/.config/zsh/10-path.zsh" \
  "$HOME/.config/zsh/20-oh-my-zsh.zsh" \
  "$HOME/.config/zsh/30-prompt.zsh" \
  "$HOME/.config/zsh/40-aliases.zsh" \
  "$HOME/.config/zsh/50-functions.zsh" \
  "$HOME/.config/zsh/60-completions.zsh" \
  "$HOME/.config/zsh/70-language-tools.zsh" \
  "$HOME/.config/zsh/90-local.zsh"
do
  [[ -r "$file" ]] && source "$file"
done
unset file

# bun completions
[ -s "/Users/alpox/.bun/_bun" ] && source "/Users/alpox/.bun/_bun"
