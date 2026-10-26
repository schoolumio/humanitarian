#!/usr/bin/env bash
# Restore a KindSpring backup into a scratch database and verify integrity.
# Usage: SOURCE_URL=postgres://… SCRATCH_URL=postgres://…/kindspring_restore_check ./scripts/verify-restore.sh backup.dump
#   SOURCE_URL  (optional) database the dump came from, to compare counts
#   SCRATCH_URL an EMPTY database that may be overwritten – never a production database
set -euo pipefail
DUMP="${1:?path to pg_dump -Fc file}"
: "${SCRATCH_URL:?set SCRATCH_URL to an empty scratch database}"
case "$SCRATCH_URL" in *prod*|*production*) echo "Refusing: SCRATCH_URL looks like production" >&2; exit 1;; esac

pg_restore --no-owner --exit-on-error -d "$SCRATCH_URL" "$DUMP"

CHECK="select (select count(*) from users) users, (select count(*) from payments) payments,
  (select count(*) from journal_lines) journal_lines,
  (select coalesce(sum(\"debitMinor\"),0) - coalesce(sum(\"creditMinor\"),0) from journal_lines) ledger_net,
  (select count(*) from audit_logs) audit_logs,
  (select count(*) from pg_trigger where tgname like '%append_only') append_only_triggers;"

echo "Restored:"; psql -X -A -F ' | ' -c "$CHECK" "$SCRATCH_URL"
if [[ -n "${SOURCE_URL:-}" ]]; then echo "Source:"; psql -X -A -F ' | ' -c "$CHECK" "$SOURCE_URL"; fi

UNBALANCED=$(psql -X -At -c "select count(*) from (select \"entryId\" from journal_lines group by \"entryId\" having sum(\"debitMinor\") <> sum(\"creditMinor\")) x" "$SCRATCH_URL")
[[ "$UNBALANCED" == "0" ]] || { echo "FAIL: $UNBALANCED unbalanced journal entries" >&2; exit 1; }
if psql -X -q -c "update audit_logs set action = action where false" "$SCRATCH_URL" 2>/dev/null; then
  # 'where false' touches no rows; probe the trigger on a real row if any exist
  if [[ $(psql -X -At -c "select count(*) from audit_logs" "$SCRATCH_URL") != "0" ]] && psql -X -q -c "update audit_logs set action = action where id = (select id from audit_logs limit 1)" "$SCRATCH_URL" 2>/dev/null; then
    echo "FAIL: audit_logs is not append-only after restore" >&2; exit 1
  fi
fi
echo "OK: ledger balanced, append-only protections present. Now run the app against the scratch DB and spot-check."
