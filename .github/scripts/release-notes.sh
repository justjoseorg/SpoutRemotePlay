#!/usr/bin/env bash
# Prints the release notes for VERSION (MAJOR.MINOR.PATCH).
# Minor releases (PATCH = 0) use their hand-written "## MAJOR.MINOR" section of CHANGELOG.md
# and fail if it is missing. Patch releases use manual notes or the merged PR title and number.
# Usage: release-notes.sh VERSION [NOTES PR_NUMBER]
set -euo pipefail
version=$1
minor=${version%.*}
patch=${version##*.}
if [ "$patch" = 0 ]; then
  notes=$(awk -v h="## ${minor}" '{ sub(/\r$/, "") } $0 == h { f = 1; next } /^## / { if (f) exit } f' CHANGELOG.md 2>/dev/null || true)
  if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
    echo "CHANGELOG.md has no '## ${minor}' section: minor releases need a written changelog." >&2
    exit 1
  fi
  printf '%s\n' "$notes"
elif [ -n "${3:-}" ]; then
  printf '%s (#%s)\n' "${2:-}" "$3"
elif [ -n "${2:-}" ]; then
  printf '%s\n' "$2"
else
  echo "Patch releases need release notes or a PR title." >&2
  exit 1
fi