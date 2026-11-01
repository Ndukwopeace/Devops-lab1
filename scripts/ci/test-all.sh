#!/usr/bin/env bash
# Runs every component's tests and exits non-zero if any component fails.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
failed=()

for component in frontend python-api node-api java-api; do
  echo "=== $component ==="
  # `if !` keeps set -e from stopping at the first failure so every component reports.
  if ! "$here/test-component.sh" "$component"; then
    failed+=("$component")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED: ${failed[*]}" >&2
  exit 1
fi
echo "All components passed."
