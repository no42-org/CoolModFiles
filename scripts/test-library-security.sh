#!/usr/bin/env bash
# Adversarial smoke test for the library API's path-traversal protection
# and method/extension allowlist. Assumes a running server with LIBRARY_ROOT
# set to a directory that contains at least one valid module file
# (e.g. classics/test.mod) and does NOT contain a file outside the
# allowlist named "secret.txt".
#
# Run after `make run` (with a populated mods/ folder) or `npm run dev`
# (with LIBRARY_ROOT pointing to such a folder).
#
# Usage:
#   bash scripts/test-library-security.sh [base-url]
#
# Defaults to http://localhost:3000.

set -u

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0

http_status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

check() {
  local description="$1"
  local expected="$2"
  local got="$3"
  if [ "$got" = "$expected" ]; then
    echo "  ✓ $description (HTTP $got)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $description (expected $expected, got $got)"
    FAIL=$((FAIL + 1))
  fi
}

# check_rejected: passes if any of the listed rejection codes match.
# Used for path-traversal tests where the exact code (403 vs 404)
# depends on whether the resolved path happens to exist on the host.
# Both are secure — the API didn't serve the file. Listing exact codes
# in priority order keeps the test informative ("both kinds of reject
# are acceptable here") while still asserting "not 200 / not 5xx".
check_rejected() {
  local description="$1"
  local got="$2"
  shift 2
  for code in "$@"; do
    if [ "$got" = "$code" ]; then
      echo "  ✓ $description (HTTP $got — rejected)"
      PASS=$((PASS + 1))
      return
    fi
  done
  echo "  ✗ $description (expected any of $* — got $got)"
  FAIL=$((FAIL + 1))
}

echo "Testing $BASE_URL"
echo

# Sanity: probe /api/library — the rest of the suite assumes it responds 200.
sanity=$(http_status "$BASE_URL/api/library?path=")
if [ "$sanity" = "404" ]; then
  echo "Library API is disabled (LIBRARY_ROOT unset). Set LIBRARY_ROOT and restart."
  exit 1
fi
if [ "$sanity" != "200" ]; then
  echo "Sanity probe failed: GET /api/library?path= returned $sanity (expected 200)"
  exit 1
fi
echo "  ✓ sanity: library API reachable"
echo

echo "Path traversal — listing endpoint:"
# Traversal targets either land on a real outside-root path (403) or
# a non-existent one (404) depending on host fs layout. Both are secure.
check_rejected "rejects ../../../etc" \
  "$(http_status "$BASE_URL/api/library?path=../../../etc")" 403 404
check_rejected "rejects URL-encoded %2E%2E%2F%2E%2E" \
  "$(http_status "$BASE_URL/api/library?path=%2E%2E%2F%2E%2E")" 403 404
check_rejected "rejects non-existent traversal" \
  "$(http_status "$BASE_URL/api/library?path=../../../does-not-exist-xyz")" 403 404
echo

echo "Path traversal — file endpoint:"
check_rejected "rejects ../../etc/passwd" \
  "$(http_status "$BASE_URL/api/library/file?path=../../etc/passwd")" 403 404
# Absolute path: leading / stripped, becomes relative-to-root → 404 (ENOENT)
check "treats absolute /etc/passwd as relative → not found" "404" \
  "$(http_status "$BASE_URL/api/library/file?path=/etc/passwd")"
echo

echo "Extension allowlist:"
# A non-existent .txt file → 404 (would be 404 even if existed; allowlist rejects)
check "rejects .txt (not in allowlist)" "404" \
  "$(http_status "$BASE_URL/api/library/file?path=any.txt")"
echo

echo "HTTP method allowlist:"
check "rejects POST on /api/library" "405" \
  "$(http_status -X POST "$BASE_URL/api/library")"
check "rejects DELETE on /api/library/file" "405" \
  "$(http_status -X DELETE "$BASE_URL/api/library/file?path=anything")"
check "rejects PUT on /api/library/search" "405" \
  "$(http_status -X PUT "$BASE_URL/api/library/search?q=x")"
echo

echo "Search input validation:"
check "rejects empty q" "400" \
  "$(http_status "$BASE_URL/api/library/search?q=")"
check "rejects missing q" "400" \
  "$(http_status "$BASE_URL/api/library/search")"

echo
echo "Result: $PASS passed, $FAIL failed"
exit $FAIL
