# Language/tool initialization. Avoid expensive runtime init on every shell.
_zsh_load_rbenv() {
  unfunction ruby gem bundle rake rails rbenv 2>/dev/null || true
  if command -v rbenv >/dev/null 2>&1; then
    eval "$(command rbenv init - zsh)"
  fi
}

if command -v rbenv >/dev/null 2>&1; then
  rbenv() { _zsh_load_rbenv; rbenv "$@"; }
  ruby() { _zsh_load_rbenv; ruby "$@"; }
  gem() { _zsh_load_rbenv; gem "$@"; }
  bundle() { _zsh_load_rbenv; bundle "$@"; }
  rake() { _zsh_load_rbenv; rake "$@"; }
  rails() { _zsh_load_rbenv; rails "$@"; }
fi
