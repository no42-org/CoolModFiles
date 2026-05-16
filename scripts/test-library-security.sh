#!/usr/bin/env bash
# Adversarial smoke test for the library API's path-traversal protection
# and method/extension allowlist. Assumes a running server with LIBRARY_ROOT
# set to a directory that contains at least one valid module file
# (e.g. classics/test.mod) and does NOT contain a file outside the
# allowlist named "secret.txt".
#
# TFMX coverage (added with add-tfmx-library-playback): the script also
# probes the broadened allowlist + orphan-half rejection at the file
# endpoint and the method allowlist on the new tfmx-random endpoint.
# These TFMX-specific assertions are skipped when the fixtures are not
# present so the script remains runnable against a MOD-only library;
# set up the fixtures (see TFMX_FIXTURES_README below) to exercise the
# full surface.
#
#   TFMX_FIXTURES_README:
#   To exercise the TFMX-specific assertions, place these files inside
#   the directory pointed to by LIBRARY_ROOT:
#     tfmx-fixture/mdat.test     ← paired half (any bytes)
#     tfmx-fixture/smpl.test     ← paired half (any bytes)
#     tfmx-fixture/mdat.orphan   ← orphan half (NO matching smpl.orphan)
#   The assertions probe:
#     - paired half streams (200)
#     - orphan half is rejected (404) even though its extension is allowlisted
#     - a sensitively-named orphan (`mdat.passwords`) would not leak
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

echo "TFMX random endpoint — method allowlist:"
check "rejects POST on /api/library/tfmx-random" "405" \
  "$(http_status -X POST "$BASE_URL/api/library/tfmx-random")"
check "rejects DELETE on /api/library/tfmx-random" "405" \
  "$(http_status -X DELETE "$BASE_URL/api/library/tfmx-random")"
echo

echo "TFMX file endpoint — extension allowlist + orphan rejection:"
# Gate the TFMX assertion set on fixture presence. The probe IS the
# "serves paired half" assertion — don't double-count by re-asserting
# the same response value. Set TFMX_FIXTURES_REQUIRED=1 to fail the run
# if fixtures are absent (intended for CI).
fixture_probe=$(http_status "$BASE_URL/api/library/file?path=tfmx-fixture/mdat.test")
if [ "$fixture_probe" = "200" ]; then
  echo "  ✓ serves paired TFMX half (.mdat with sibling .smpl) (HTTP 200)"
  PASS=$((PASS + 1))
  check "serves sibling .smpl when partner exists" "200" \
    "$(http_status "$BASE_URL/api/library/file?path=tfmx-fixture/smpl.test")"
  check "rejects orphan .mdat (no matching .smpl) — security perimeter intact" "404" \
    "$(http_status "$BASE_URL/api/library/file?path=tfmx-fixture/mdat.orphan")"
  # Sensitively-named orphan: confirms that broadening the allowlist
  # did NOT create a path for arbitrary mdat.* files to leak.
  check "rejects sensitively-named orphan mdat.passwords" "404" \
    "$(http_status "$BASE_URL/api/library/file?path=tfmx-fixture/mdat.passwords")"
elif [ -n "${TFMX_FIXTURES_REQUIRED:-}" ]; then
  echo "  ✗ tfmx-fixture/ not present in LIBRARY_ROOT (TFMX_FIXTURES_REQUIRED set)"
  echo "    See TFMX_FIXTURES_README at top of script for setup."
  FAIL=$((FAIL + 1))
else
  echo "  (skipped: tfmx-fixture/ not present in LIBRARY_ROOT — see TFMX_FIXTURES_README"
  echo "   at top of script. Set TFMX_FIXTURES_REQUIRED=1 to fail the run on skip — recommended in CI.)"
fi
echo

echo "Result: $PASS passed, $FAIL failed"
exit $FAIL
