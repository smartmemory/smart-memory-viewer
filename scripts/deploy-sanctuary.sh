#!/usr/bin/env bash
# Upload only to a unique stage, then use the infra atomic exchange/recovery helper.
set -euo pipefail
[ "$#" -eq 0 ] || { echo 'Usage: bash scripts/deploy-sanctuary.sh' >&2; exit 2; }
SELF=$(cd "$(dirname "$0")" && pwd)
cd "$SELF/.."
HOST=root@40.160.38.143
KEEP_BACKUPS=5

# The rollback tag names HEAD, so the built tree must be exactly HEAD. Checked
# before the build inspection and before any remote operation.
if [ -n "$(git status --porcelain)" ]; then
  echo 'FAIL: working tree is dirty; commit or stash so the rollback tag names the deployed build' >&2
  exit 1
fi

# A foreign PostHog token previously polluted another product's analytics.
# Inspect the built artifact before any remote operation, including stage creation.
node scripts/assert-prod-bundle.mjs dist-sanctuary

ENTRY=$(python3 -I - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
import re

class EntryParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'module' and 'src' in attrs:
            entries.append(attrs['src'].removeprefix('/'))

entries = []
EntryParser().feed(Path('dist-sanctuary/index.html').read_text())
if len(entries) != 1 or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9._/-]*', entries[0]) or '..' in entries[0].split('/'):
    raise SystemExit('FAIL: expected one safe module entry in dist-sanctuary/index.html')
print(entries[0])
PY
)
ISHA=$(shasum -a 256 dist-sanctuary/index.html | cut -d' ' -f1)
RUN=$(date -u +%Y%m%d%H%M%S)-$$-$(python3 -I -c 'import secrets; print(secrets.token_hex(4))')
TAG=$(git rev-parse --short=12 HEAD)-$RUN
STAGE=/var/www/.stage-sanctuary-$RUN

# SSH joins arguments for a remote shell. Refuse any word needing shell quoting.
rssh() {
  local word
  for word in "$@"; do
    [[ $word =~ ^[A-Za-z0-9._/:=+-]+$ ]] || { echo 'FAIL: unsafe remote argument' >&2; return 1; }
  done
  ssh "$HOST" "$@"
}

STAGED=0
SWAPPED=0
cleanup() {
  local rc=$?
  trap - EXIT
  if [ "$STAGED" = 1 ] && [ "$SWAPPED" = 0 ]; then
    # Recover by inode identity before deleting a stage that may hold the old tree.
    rssh python3 - cleanup sanctuary "$RUN" < "$SELF/static_ui_swap.py" \
      || echo "WARN: remote recovery/cleanup failed. Inspect $STAGE and /var/www/.static-deploy-sanctuary.state" >&2
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

rssh mkdir -m 755 "$STAGE"
STAGED=1
RS=(--recursive --links --times --checksum --delete --no-owner --no-group --timeout=45)
rsync "${RS[@]}" dist-sanctuary/ "$HOST:$STAGE/"
rssh chmod -R a+rX "$STAGE"
DIFF=$(rsync "${RS[@]}" --dry-run --itemize-changes dist-sanctuary/ "$HOST:$STAGE/")
if [ -n "$DIFF" ]; then
  echo 'FAIL: remote stage differs from the inspected build (first 20 itemized lines):' >&2
  printf '%s\n' "$DIFF" | head -n 20 >&2
  exit 1
fi
rssh python3 - swap sanctuary "$RUN" "$TAG" "$ENTRY" "$ISHA" < "$SELF/static_ui_swap.py"
SWAPPED=1

# The swap is done. A prune failure must not fail the deploy, but it is never silent.
rssh python3 - "$KEEP_BACKUPS" < "$SELF/prune_sanctuary_backups.py" \
  || echo "WARN: rollback prune failed; older /var/www/sanctuary.bak-* copies were not removed" >&2
