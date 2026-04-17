#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
API_PREFIX="${API_PREFIX:-api}"
API_PREFIX="${API_PREFIX#/}"
API_PREFIX="${API_PREFIX%/}"

if [[ -n "$API_PREFIX" ]]; then
  API_BASE="$BASE_URL/$API_PREFIX"
else
  API_BASE="$BASE_URL"
fi

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@payflow.dev}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-customer@payflow.dev}"
CUSTOMER_PASSWORD="${CUSTOMER_PASSWORD:-CustomerPass123}"
TEST_REGISTER_EMAIL="${TEST_REGISTER_EMAIL:-live-test-$(date +%s)@payflow.dev}"
TEST_REGISTER_FIRST_NAME="${TEST_REGISTER_FIRST_NAME:-Live}"
TEST_REGISTER_LAST_NAME="${TEST_REGISTER_LAST_NAME:-Tester}"
TEST_REGISTER_PASSWORD="${TEST_REGISTER_PASSWORD:-LiveTest123}"

LAST_STATUS=""
LAST_BODY=""

request() {
  local method="$1"
  local url="$2"
  local payload="${3:-}"
  local token="${4:-}"
  local tmp_body

  tmp_body="$(mktemp)"

  local curl_args=(
    -sS
    -X "$method"
    -H "Accept: application/json"
    -o "$tmp_body"
    -w "%{http_code}"
  )

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$payload" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data "$payload")
  fi

  LAST_STATUS="$(curl "${curl_args[@]}" "$url")"
  LAST_BODY="$(cat "$tmp_body")"
  rm -f "$tmp_body"
}

json_get() {
  local expression="$1"
  printf '%s' "$LAST_BODY" | node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
const data = JSON.parse(input || '{}');
const value = (() => ${expression})();
if (value === undefined || value === null) process.exit(1);
if (typeof value === 'object') {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
"
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local message="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $message" >&2
    echo "Expected: $expected" >&2
    echo "Actual:   $actual" >&2
    exit 1
  fi
}

assert_nonempty() {
  local value="$1"
  local message="$2"

  if [[ -z "$value" ]]; then
    echo "FAIL: $message" >&2
    exit 1
  fi
}

pass() {
  echo "PASS $1"
}

echo "Testing Payflow live endpoints at $API_BASE"

request "GET" "$API_BASE"
assert_eq "$LAST_STATUS" "200" "GET /api should return 200"
assert_eq "$(json_get 'data.success')" "true" "GET /api should return success=true"
assert_eq "$(json_get 'data.data.service')" "payflow" "GET /api service mismatch"
assert_eq "$(json_get 'data.data.status')" "ok" "GET /api status mismatch"
pass "GET /${API_PREFIX}"

register_payload=$(printf '{"email":"%s","firstName":"%s","lastName":"%s","password":"%s"}' \
  "$TEST_REGISTER_EMAIL" "$TEST_REGISTER_FIRST_NAME" "$TEST_REGISTER_LAST_NAME" "$TEST_REGISTER_PASSWORD")
request "POST" "$API_BASE/auth/register" "$register_payload"
assert_eq "$LAST_STATUS" "201" "POST /auth/register should return 201"
assert_eq "$(json_get 'data.success')" "true" "register should return success=true"
assert_eq "$(json_get 'data.data.user.email')" "$TEST_REGISTER_EMAIL" "register email mismatch"
assert_nonempty "$(json_get 'data.data.accessToken')" "register access token missing"
pass "POST /${API_PREFIX}/auth/register"

customer_login_payload=$(printf '{"email":"%s","password":"%s"}' \
  "$CUSTOMER_EMAIL" "$CUSTOMER_PASSWORD")
request "POST" "$API_BASE/auth/login" "$customer_login_payload"
assert_eq "$LAST_STATUS" "201" "POST /auth/login for customer should return 201"
CUSTOMER_TOKEN="$(json_get 'data.data.accessToken')"
assert_nonempty "$CUSTOMER_TOKEN" "customer access token missing"
assert_eq "$(json_get 'data.data.user.email')" "$CUSTOMER_EMAIL" "customer login email mismatch"
pass "POST /${API_PREFIX}/auth/login (customer)"

request "GET" "$API_BASE/auth/me" "" "$CUSTOMER_TOKEN"
assert_eq "$LAST_STATUS" "200" "GET /auth/me should return 200"
assert_eq "$(json_get 'data.data.email')" "$CUSTOMER_EMAIL" "auth/me email mismatch"
pass "GET /${API_PREFIX}/auth/me"

request "GET" "$API_BASE/users/me" "" "$CUSTOMER_TOKEN"
assert_eq "$LAST_STATUS" "200" "GET /users/me should return 200"
assert_eq "$(json_get 'data.data.email')" "$CUSTOMER_EMAIL" "users/me email mismatch"
pass "GET /${API_PREFIX}/users/me"

request "GET" "$API_BASE/users/admin" "" "$CUSTOMER_TOKEN"
assert_eq "$LAST_STATUS" "403" "customer should be forbidden from GET /users/admin"
assert_eq "$(json_get 'data.success')" "false" "forbidden response should return success=false"
pass "GET /${API_PREFIX}/users/admin -> 403"

admin_login_payload=$(printf '{"email":"%s","password":"%s"}' \
  "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
request "POST" "$API_BASE/auth/login" "$admin_login_payload"
assert_eq "$LAST_STATUS" "201" "POST /auth/login for admin should return 201"
ADMIN_TOKEN="$(json_get 'data.data.accessToken')"
assert_nonempty "$ADMIN_TOKEN" "admin access token missing"
assert_eq "$(json_get 'data.data.user.role')" "ADMIN" "admin role mismatch"
pass "POST /${API_PREFIX}/auth/login (admin)"

request "GET" "$API_BASE/users/admin" "" "$ADMIN_TOKEN"
assert_eq "$LAST_STATUS" "200" "admin should access GET /users/admin"
assert_eq "$(json_get 'data.success')" "true" "admin summary should return success=true"
assert_eq "$(json_get 'Array.isArray(data.data)')" "true" "admin summary must be an array"
assert_eq "$(json_get 'data.data.length >= 2')" "true" "admin summary returned too few users"
assert_eq "$(json_get 'data.data.every((user) => user.passwordHash === undefined)')" "true" "admin summary leaked passwordHash"
pass "GET /${API_PREFIX}/users/admin"

echo "Live test completed successfully."
echo "Registered test user: $TEST_REGISTER_EMAIL"
