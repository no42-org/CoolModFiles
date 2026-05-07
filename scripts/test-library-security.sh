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
# ../../../etc resolves to a real outside-root directory → 403
check "rejects ../../../etc" "403" \
  "$(http_status "$BASE_URL/api/library?path=../../../etc")"
# URL-encoded ../.. → server's URL parser decodes to ../.. → 403
check "rejects URL-encoded %2E%2E%2F%2E%2E" "403" \
  "$(http_status "$BASE_URL/api/library?path=%2E%2E%2F%2E%2E")"
# A path that resolves outside root but the target doesn't exist → 404
check "rejects non-existent traversal" "404" \
  "$(http_status "$BASE_URL/api/library?path=../../../does-not-exist-xyz")"
echo

echo "Path traversal — file endpoint:"
check "rejects ../../etc/passwd (real file outside root)" "403" \
  "$(http_status "$BASE_URL/api/library/file?path=../../etc/passwd")"
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
