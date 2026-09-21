#!/usr/bin/env bash
# Copy the OMO config worth carrying between machines into this folder, or put it back.
#
#   ./backup.sh              ~/.omo -> omo/files/
#   ./backup.sh --restore    omo/files/ -> ~/.omo
#
# Left out on purpose: conversation history (sessions/, memory/agents/*/runtime/),
# logs, caches, tmp, regenerated indexes (codegraph/, npm/, lsp-daemon/), installed
# binaries (bin/), and every *.bak.* / backups/ / migration-backup-* / repairs/
# archive. Also every credential file: auth.json, agent/auth.json, agent/mcp-auth/,
# agent/credential-pool-state.json. Never add those to this repo — it is public.
set -euo pipefail

SRC="${OMO_DIR:-$HOME/.omo}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/files"

PATHS=(
  # shared base
  omo.jsonc
  settings.json
  mcp.json
  config.jsonc
  models-store.json
  trust.json
  rules
  # agent (senpi harness) surface
  agent/settings.json
  agent/mcp.json
  agent/models.json
  agent/models-store.json
  agent/trust.json
  agent/extensions
  agent/pane-title-overrides
  agent/tests
  agent/agent-tab-title.js
  agent/osc-title-extraction.js
  agent/tab-title-resolution.js
  agent/orca-pi-adapter/bin
  agent/orca-pi-adapter/lib
  agent/orca-pi-adapter/test
)

case "${1:-}" in
  "")        from="$SRC";  to="$DEST"; mode="backed up to" ;;
  --restore) from="$DEST"; to="$SRC";  mode="restored from" ;;
  *)         echo "usage: $0 [--restore]" >&2; exit 2 ;;
esac

[[ -d "$from" ]] || { echo "no such source dir: $from" >&2; exit 1; }

missing=0
for p in "${PATHS[@]}"; do
  if [[ ! -e "$from/$p" ]]; then
    echo "skip (not present): $p"
    missing=$((missing + 1))
    continue
  fi
  mkdir -p "$(dirname "$to/$p")"
  # Only the repo copy is disposable, so only clear it. Never wipe a live config.
  [[ "$to" == "$DEST" ]] && rm -rf "${to:?}/$p"
  cp -R "$from/$p" "$to/$p"
  echo "ok: $p"
done

if [[ "$to" == "$DEST" ]]; then
  # Patch/editor leftovers that happen to live next to real files.
  find "$DEST" \( -name '*.orig' -o -name '*.rej' -o -name '*.bak.*' -o -name '*~' \) -delete

  # mcp.json carries live `Authorization: Bearer ...` tokens. This repo is public, so
  # the values never leave the machine — re-auth the server after a restore.
  for f in "$DEST/mcp.json" "$DEST/agent/mcp.json"; do
    [[ -f "$f" ]] && sed -i '' -E 's/("Authorization"[[:space:]]*:[[:space:]]*"Bearer )[^"]*/\1REDACTED/' "$f"
  done

  # Last line of defence: refuse to leave a credential in a public repo.
  if grep -rqE 'Bearer [A-Za-z0-9._-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|(sk-|ghp_|gho_|xox[bp]-)[A-Za-z0-9]{10,}' "$DEST"; then
    echo "REFUSED: credential-looking value under $DEST — redact it before committing:" >&2
    grep -rlE 'Bearer [A-Za-z0-9._-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|(sk-|ghp_|gho_|xox[bp]-)[A-Za-z0-9]{10,}' "$DEST" >&2
    exit 1
  fi
fi

echo "$((${#PATHS[@]} - missing)) of ${#PATHS[@]} paths $mode $to"
