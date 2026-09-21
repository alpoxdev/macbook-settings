#!/usr/bin/env bash
# Copy the opencodex config worth carrying between machines into this folder, or put it back.
#
#   ./backup.sh              ~/.opencodex -> opencodex/files/
#   ./backup.sh --restore    opencodex/files/ -> ~/.opencodex
#
# The PATHS list below is the whole contract: a path that is not on it is never
# copied, and a path removed from it is pruned out of opencodex/files/ on the next
# run, so a dropped file cannot linger as a stale "current" config.
#
# Left out on purpose:
#   - credentials: auth.json (provider OAuth), admin-api-token. Never add them —
#     this repo is public.
#   - runtime telemetry: usage.jsonl (191 MB), routing-history.sqlite (409 MB),
#     service.log, crash.log, spend-ledger.jsonl. Regenerated as the gateway runs.
#   - ephemeral state: ocx.pid, runtime-port.json, responses-state.json,
#     responses-state-spill/, service-state.json, *-quota-cache.json.
#   - derived/regenerable: catalog-backup*.json, config-mutation.sqlite, and
#     integrations/ (exported client snapshots + records; they carry per-machine
#     absolute paths and the exporters rebuild them from config.json).
#   - backup files: config.json.bak.*, plus the ledger salts (useless without the
#     excluded ledgers).
#
# config.json DOES carry live upstream provider keys ("apiKey": "sk-…"), so it is
# redacted below and a restore needs those keys re-entered by hand.
set -euo pipefail

SRC="${OPENCODEX_DIR:-$HOME/.opencodex}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/files"

PATHS=(
  config.json
  codex-shim.json
  codex-runtime.json
  version.json
  .opencodex-owner.json
)

REDACT_FILES=(config.json)

# Credential shapes seen in this config: quoted apiKey values, Bearer tokens, and
# bare sk-/sk_ style keys. The {16,} bound keeps the guard off short placeholders
# and off the "REDACTED" replacement itself.
SECRET_RE='"apiKey"[[:space:]]*:[[:space:]]*"[A-Za-z0-9._-]{16,}"|Bearer [A-Za-z0-9._-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|(sk-|sk_|ghp_|gho_|xox[bp]-)[A-Za-z0-9._-]{16,}'

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

  # Live provider keys must not leave the machine; re-enter them after a restore.
  for f in "${REDACT_FILES[@]}"; do
    [[ -f "$DEST/$f" ]] || continue
    sed -i '' -E \
      -e 's/("apiKey"[[:space:]]*:[[:space:]]*")[^"]*/\1REDACTED/g' \
      -e 's/("Authorization"[[:space:]]*:[[:space:]]*"Bearer )[^"]*/\1REDACTED/g' \
      -e 's/(sk-|sk_)[A-Za-z0-9._-]{16,}/REDACTED-KEY/g' \
      "$DEST/$f"
  done

  # Last line of defence: refuse to leave a credential in a public repo.
  if grep -rqE "$SECRET_RE" "$DEST"; then
    echo "REFUSED: credential-looking value under $DEST - redact it before committing:" >&2
    grep -rlE "$SECRET_RE" "$DEST" >&2
    exit 1
  fi
fi

echo "$((${#PATHS[@]} - missing)) of ${#PATHS[@]} paths $mode $to"
