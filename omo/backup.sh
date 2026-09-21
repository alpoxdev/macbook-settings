#!/usr/bin/env bash
# Copy the OMO config worth carrying between machines into this folder, or put it back.
#
#   ./backup.sh              ~/.omo -> omo/files/
#   ./backup.sh --restore    omo/files/ -> ~/.omo
#
# The PATHS list below is the whole contract: a path that is not on it is never
# copied, and a path that is removed from it is pruned out of omo/files/ on the
# next run, so a dropped file cannot linger as a stale "current" config.
#
# Left out on purpose: conversation history (sessions/, memory/agents/*/runtime/),
# logs, caches, tmp, regenerated indexes (codegraph/, npm/, lsp-daemon/), installed
# binaries (bin/), every *.bak.* / backups/ / migration-backup-* / repairs/ archive,
# and every credential file (auth.json, agent/auth.json, agent/mcp-auth/,
# agent/credential-pool-state.json). Never add those to this repo — it is public.
#
# mcp.json / agent/mcp.json are also left out: the MCP server list carries per-machine
# `Authorization: Bearer ...` tokens, so each machine keeps its own. Copy it by hand
# if you want the same servers elsewhere, then re-auth there.
set -euo pipefail

SRC="${OMO_DIR:-$HOME/.omo}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/files"

PATHS=(
  # shared base
  omo.jsonc
  settings.json
  config.jsonc
  models-store.json
  trust.json
  rules
  # agent (senpi harness) surface
  agent/settings.json
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
  if [[ -d "$from/$p" ]]; then
    mkdir -p "$to/$p"
    # `src/.` merges into the existing dir; plain `cp -R src dst` would nest it
    # as dst/basename(src) on every re-run.
    cp -R "$from/$p/." "$to/$p/"
  else
    mkdir -p "$(dirname "$to/$p")"
    cp "$from/$p" "$to/$p"
  fi
  echo "ok: $p"
done

if [[ "$to" == "$DEST" ]]; then
  # Patch/editor leftovers that happen to sit next to real files.
  find "$DEST" \( -name '*.orig' -o -name '*.rej' -o -name '*.bak.*' -o -name '*~' \) -delete

  # Mirror, not merge: anything in the copy with no counterpart in $SRC (a path
  # dropped from PATHS, a file deleted at the source) must not linger as stale config.
  while IFS= read -r f; do
    rel="${f#"$DEST"/}"
    if [[ ! -e "$SRC/$rel" ]]; then
      echo "pruned (not in $SRC): $rel"
      rm -f "$f"
    fi
  done < <(find "$DEST" -type f)
  find "$DEST" -mindepth 1 -type d -empty -delete

  # Last line of defence: refuse to leave a credential in a public repo.
  if grep -rqE 'Bearer [A-Za-z0-9._-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|(sk-|ghp_|gho_|xox[bp]-)[A-Za-z0-9]{10,}' "$DEST"; then
    echo "REFUSED: credential-looking value under $DEST — redact it before committing:" >&2
    grep -rlE 'Bearer [A-Za-z0-9._-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|(sk-|ghp_|gho_|xox[bp]-)[A-Za-z0-9]{10,}' "$DEST" >&2
    exit 1
  fi
fi

echo "$((${#PATHS[@]} - missing)) of ${#PATHS[@]} paths $mode $to"
