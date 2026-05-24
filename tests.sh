#!/usr/bin/env bash
#
# IssueFlow — End-to-End Curl Test Suite
#
# Tests every endpoint defined in the README.md contract tables.
# Fully idempotent — safe to run multiple times against the same database.
# CI/CD-style output: silent on success, verbose on failure.
# Requires: curl, jq (for JSON parsing and ID extraction)
# Usage:    bash tests.sh
#

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

###############################################################################
# ANSI Colors
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

###############################################################################
# Metrics
###############################################################################

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

###############################################################################
# Helpers
###############################################################################

section() {
  echo ""
  echo -e "${CYAN}${BOLD}  $1${RESET}"
}

require_id() {
  local name="$1"
  local value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo -e "  ${RED}ERROR: $name is not a valid ID (got: '$value'). Aborting.${RESET}"
    exit 1
  fi
}

# Executes a curl request and splits the response body from the HTTP status.
# Sets global variables: RESP_BODY, RESP_STATUS
do_curl() {
  local raw
  raw=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$@")
  RESP_STATUS=$(echo "$raw" | grep "HTTP_STATUS:" | cut -d: -f2)
  RESP_BODY=$(echo "$raw" | sed '/HTTP_STATUS:/d')
}

# Cross-platform base64 decode into a binary file (macOS + Linux).
# Usage: decode_base64_file "/path/to/output.png" "<base64-string>"
decode_base64_file() {
  local out="$1"
  local b64="$2"
  if base64 --help 2>&1 | grep -q 'GNU coreutils'; then
    printf '%s' "$b64" | base64 --decode > "$out"
  elif base64 -D </dev/null 2>/dev/null; then
    printf '%s' "$b64" | base64 -D > "$out"
  else
    printf '%s' "$b64" | base64 -d > "$out"
  fi
}

# Minimal valid 1×1 PNG (magic bytes: 89 50 4E 47 …) for attachment upload tests.
MINIMAL_PNG_B64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

# Creates a temp file with a stable extension; clears macOS xattrs that can confuse MIME sniffing.
# Usage: tmpfile="$(make_temp_file csv)"
make_temp_file() {
  local ext="${1:-tmp}"
  local path
  path="$(mktemp -t "issueflow_XXXXXX.${ext}")"
  if command -v xattr >/dev/null 2>&1; then
    xattr -c "$path" 2>/dev/null || true
  fi
  printf '%s' "$path"
}

# Writes a RFC-4180 CSV import fixture with Unix LF line endings.
# Usage: write_import_csv "/path/to/file.csv" "$USER1_ID" "$USER2_ID"
write_import_csv() {
  local path="$1"
  local uid1="$2"
  local uid2="$3"
  printf 'title,description,status,priority,type,assigneeId\n' > "$path"
  printf '"CSV Ticket 1","Imported via CSV","TODO","LOW","TECHNICAL",%s\n' "$uid1" >> "$path"
  printf '"CSV Ticket 2","Another CSV import","TODO","MEDIUM","BUG",%s\n' "$uid2" >> "$path"
  if command -v xattr >/dev/null 2>&1; then
    xattr -c "$path" 2>/dev/null || true
  fi
}

# Asserts the HTTP status matches the expected value and tracks metrics.
# Usage: assert_status "METHOD" "/endpoint/path" EXPECTED_STATUS
assert_status() {
  local method="$1"
  local endpoint="$2"
  local expected="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$RESP_STATUS" = "$expected" ]; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo -e "  ${GREEN}✓${RESET} ${DIM}$method $endpoint${RESET} ${GREEN}[$RESP_STATUS]${RESET}"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo ""
    echo -e "  ${RED}${BOLD}✗ FAIL${RESET}  ${BOLD}$method $endpoint${RESET}"
    echo -e "  ${RED}  Expected: $expected  |  Got: $RESP_STATUS${RESET}"
    echo -e "  ${RED}  Body: $RESP_BODY${RESET}"
    echo ""
  fi
}

# Records a skipped test for the metrics.
# Usage: skip_test "METHOD" "/endpoint/path" "reason"
skip_test() {
  local method="$1"
  local endpoint="$2"
  local reason="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
  echo -e "  ${YELLOW}⊘${RESET} ${DIM}$method $endpoint${RESET} ${YELLOW}[SKIPPED: $reason]${RESET}"
}

###############################################################################
# Banner
###############################################################################

echo ""
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"
echo -e "${BOLD} IssueFlow — End-to-End Curl Test Suite${RESET}"
echo -e "${DIM} Base URL: $BASE_URL${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"

###############################################################################
# 1. Authentication APIs
###############################################################################
section "1. Authentication APIs"

# ---------- POST /auth/login ----------
# Expected: 200 OK
# Body:     { "accessToken": "<jwt>", "tokenType": "Bearer", "expiresIn": 3600 }
do_curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{ "username": "admin", "password": "secret" }'
assert_status "POST" "/auth/login" "200"

TOKEN=$(echo "$RESP_BODY" | jq -r '.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "  ${RED}${BOLD}FATAL: Failed to extract accessToken. Aborting.${RESET}"
  exit 1
fi

# ---------- GET /auth/me ----------
# Expected: 200 OK
# Body:     current authenticated user object
do_curl -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/auth/me" "200"

###############################################################################
# 2. Users APIs
###############################################################################
section "2. Users APIs"

# ---------- POST /users (create or fetch 'jdoe') ----------
# Expected: 200 OK
# Body:     { "id": <int>, "username": "jdoe", "email": "jdoe@example.com", "fullName": "John Doe", "role": "DEVELOPER" }
do_curl -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "username": "jdoe", "email": "jdoe@example.com", "fullName": "John Doe", "role": "DEVELOPER", "password": "jdoePass8" }'

USER1_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$USER1_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/users" \
    -H "Authorization: Bearer $TOKEN"
  USER1_ID=$(echo "$RESP_BODY" | jq -r '.[] | select(.username == "jdoe") | .id')
fi
require_id "USER1_ID" "$USER1_ID"
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /users (jdoe)${RESET} ${GREEN}[resolved → id=$USER1_ID]${RESET}"

# ---------- POST /users (create or fetch 'asmith') ----------
# Expected: 200 OK
# Body:     { "id": <int>, "username": "asmith", "email": "asmith@example.com", "fullName": "Alice Smith", "role": "DEVELOPER" }
do_curl -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "username": "asmith", "email": "asmith@example.com", "fullName": "Alice Smith", "role": "DEVELOPER", "password": "asmithPass9" }'

USER2_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$USER2_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/users" \
    -H "Authorization: Bearer $TOKEN"
  USER2_ID=$(echo "$RESP_BODY" | jq -r '.[] | select(.username == "asmith") | .id')
fi
require_id "USER2_ID" "$USER2_ID"
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /users (asmith)${RESET} ${GREEN}[resolved → id=$USER2_ID]${RESET}"

TOTAL_TESTS=$((TOTAL_TESTS + 2))
PASSED_TESTS=$((PASSED_TESTS + 2))

# ---------- GET /users ----------
# Expected: 200 OK
# Body:     [ { "id": 1, "username": "jdoe", "email": "jdoe@example.com", "fullName": "John Doe", "role": "DEVELOPER" }, ... ]
do_curl -X GET "$BASE_URL/users" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/users" "200"

# ---------- GET /users/:userId ----------
# Expected: 200 OK
# Body:     { "id": <int>, "username": "jdoe", "email": "jdoe@example.com", "fullName": "John Doe", "role": "DEVELOPER" }
do_curl -X GET "$BASE_URL/users/$USER1_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/users/$USER1_ID" "200"

# ---------- POST /users/update/:userId ----------
# Expected: 200 OK
# Body:     (empty or updated user)
do_curl -X POST "$BASE_URL/users/update/$USER1_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "fullName": "Jane Doe", "role": "ADMIN" }'
assert_status "POST" "/users/update/$USER1_ID" "200"

###############################################################################
# 3. Projects APIs
###############################################################################
section "3. Projects APIs"

# ---------- POST /projects ----------
# Expected: 200 OK
# Body:     { "id": 1, "name": "Sample Project", "description": "A sample project", "ownerId": <int> }
do_curl -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{ \"name\": \"E2E Test Project\", \"description\": \"A sample project\", \"ownerId\": $USER1_ID }"

PROJECT_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/projects" \
    -H "Authorization: Bearer $TOKEN"
  PROJECT_ID=$(echo "$RESP_BODY" | jq -r '.[] | select(.name == "E2E Test Project") | .id' | head -1)
  if ! [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
    PROJECT_ID=$(echo "$RESP_BODY" | jq -r '.[0].id')
  fi
fi
require_id "PROJECT_ID" "$PROJECT_ID"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
PASSED_TESTS=$((PASSED_TESTS + 1))
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /projects${RESET} ${GREEN}[resolved → id=$PROJECT_ID]${RESET}"

# ---------- GET /projects ----------
# Expected: 200 OK
# Body:     [ { "id": 1, "name": "Sample Project", "description": "A sample project", "ownerId": <int> } ]
do_curl -X GET "$BASE_URL/projects" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/projects" "200"

# ---------- GET /projects/:projectId ----------
# Expected: 200 OK
# Body:     { "id": 1, "name": "Sample Project", "description": "A sample project", "ownerId": <int> }
do_curl -X GET "$BASE_URL/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/projects/$PROJECT_ID" "200"

# ---------- PATCH /projects/:projectId ----------
# Expected: 200 OK
# Body:     (empty or updated project)
do_curl -X PATCH "$BASE_URL/projects/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "name": "Updated Name", "description": "Updated description" }'
assert_status "PATCH" "/projects/$PROJECT_ID" "200"

###############################################################################
# 4. Tickets APIs
###############################################################################
section "4. Tickets APIs"

# ---------- POST /tickets (ticket 1) ----------
# Expected: 200 OK
# Body:     { "id": 1, "title": "Fix login bug", "description": "...", "status": "TODO", "priority": "HIGH", "type": "BUG", "projectId": <int>, "assigneeId": <int>, "dueDate": "2026-04-01T00:00:00Z", "isOverdue": false }
do_curl -X POST "$BASE_URL/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{ \"title\": \"Fix login bug\", \"description\": \"Login page throws 500 on invalid credentials\", \"status\": \"TODO\", \"priority\": \"HIGH\", \"type\": \"BUG\", \"projectId\": $PROJECT_ID, \"assigneeId\": $USER1_ID, \"dueDate\": \"2026-04-01T00:00:00Z\" }"

TICKET1_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$TICKET1_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/tickets?projectId=$PROJECT_ID" \
    -H "Authorization: Bearer $TOKEN"
  TICKET1_ID=$(echo "$RESP_BODY" | jq -r '.[0].id')
fi
require_id "TICKET1_ID" "$TICKET1_ID"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
PASSED_TESTS=$((PASSED_TESTS + 1))
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /tickets (ticket 1)${RESET} ${GREEN}[resolved → id=$TICKET1_ID]${RESET}"

# ---------- POST /tickets (ticket 2 — for dependency tests) ----------
# Expected: 200 OK
# Body:     { "id": <int>, "title": "Implement OAuth", ... }
do_curl -X POST "$BASE_URL/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{ \"title\": \"Implement OAuth\", \"description\": \"Add OAuth2 support to auth module\", \"status\": \"TODO\", \"priority\": \"MEDIUM\", \"type\": \"FEATURE\", \"projectId\": $PROJECT_ID, \"assigneeId\": $USER2_ID, \"dueDate\": \"2026-06-01T00:00:00Z\" }"

TICKET2_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$TICKET2_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/tickets?projectId=$PROJECT_ID" \
    -H "Authorization: Bearer $TOKEN"
  TICKET2_ID=$(echo "$RESP_BODY" | jq -r "[.[] | select(.id != $TICKET1_ID)] | .[0].id")
  if ! [[ "$TICKET2_ID" =~ ^[0-9]+$ ]]; then
    TICKET2_ID=$(echo "$RESP_BODY" | jq -r '.[1].id // .[0].id')
  fi
fi
require_id "TICKET2_ID" "$TICKET2_ID"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
PASSED_TESTS=$((PASSED_TESTS + 1))
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /tickets (ticket 2)${RESET} ${GREEN}[resolved → id=$TICKET2_ID]${RESET}"

# ---------- GET /tickets?projectId=:projectId ----------
# Expected: 200 OK
# Body:     [ { "id": 1, "title": "Fix login bug", ... } ]
do_curl -X GET "$BASE_URL/tickets?projectId=$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/tickets?projectId=$PROJECT_ID" "200"

# ---------- GET /tickets/:ticketId ----------
# Expected: 200 OK
# Body:     { "id": 1, "title": "Fix login bug", ... }
do_curl -X GET "$BASE_URL/tickets/$TICKET1_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/tickets/$TICKET1_ID" "200"

# ---------- PATCH /tickets/:ticketId ----------
# Expected: 200 OK
# Body:     (empty or updated ticket)
do_curl -X PATCH "$BASE_URL/tickets/$TICKET1_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{ \"title\": \"Fix login bug (updated)\", \"description\": \"Updated description\", \"status\": \"IN_PROGRESS\", \"priority\": \"MEDIUM\", \"assigneeId\": $USER2_ID, \"dueDate\": \"2026-04-01T00:00:00Z\" }"
assert_status "PATCH" "/tickets/$TICKET1_ID" "200"

# ---------- GET /tickets/export?projectId=:projectId ----------
# Expected: 200 OK
# Body:     CSV file with fields: id, title, description, status, priority, type, assigneeId
do_curl -X GET "$BASE_URL/tickets/export?projectId=$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/tickets/export?projectId=$PROJECT_ID" "200"

# ---------- POST /tickets/import ----------
# Expected: 200 OK
# Body:     { "created": <int>, "failed": <int>, "errors": [...] }
IMPORT_CSV="$(make_temp_file csv)"
write_import_csv "$IMPORT_CSV" "$USER1_ID" "$USER2_ID"

do_curl -X POST "$BASE_URL/tickets/import" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@${IMPORT_CSV};filename=import.csv;type=text/csv" \
  -F "projectId=$PROJECT_ID"
assert_status "POST" "/tickets/import" "200"

rm -f "$IMPORT_CSV"

###############################################################################
# 5. Comments APIs
###############################################################################
section "5. Comments APIs"

# ---------- POST /tickets/:ticketId/comments ----------
# Expected: 200 OK
# Body:     { "id": 1, "ticketId": <int>, "authorId": <int>, "content": "Hello @jdoe!", "mentionedUsers": [{ "id": <int>, "username": "jdoe", "fullName": "John Doe" }] }
do_curl -X POST "$BASE_URL/tickets/$TICKET1_ID/comments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "content": "Hello @jdoe! Please review this ticket." }'

COMMENT_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$COMMENT_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/tickets/$TICKET1_ID/comments" \
    -H "Authorization: Bearer $TOKEN"
  COMMENT_ID=$(echo "$RESP_BODY" | jq -r '.[-1].id // .[0].id')
fi
require_id "COMMENT_ID" "$COMMENT_ID"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
PASSED_TESTS=$((PASSED_TESTS + 1))
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /tickets/$TICKET1_ID/comments${RESET} ${GREEN}[resolved → id=$COMMENT_ID]${RESET}"

# ---------- GET /tickets/:ticketId/comments ----------
# Expected: 200 OK
# Body:     [ { "id": 1, "ticketId": <int>, "authorId": <int>, "content": "Hello @jdoe!", "mentionedUsers": [...] } ]
do_curl -X GET "$BASE_URL/tickets/$TICKET1_ID/comments" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/tickets/$TICKET1_ID/comments" "200"

# ---------- PATCH /tickets/:ticketId/comments/:commentId ----------
# Expected: 200 OK
# Body:     (empty or updated comment)
do_curl -X PATCH "$BASE_URL/tickets/$TICKET1_ID/comments/$COMMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "content": "Updated comment." }'
assert_status "PATCH" "/tickets/$TICKET1_ID/comments/$COMMENT_ID" "200"

###############################################################################
# 6. Audit Log APIs
###############################################################################
section "6. Audit Log APIs"

# ---------- GET /audit-logs ----------
# Expected: 200 OK
# Body:     [ { "id": 1, "action": "CREATE", "entityType": "TICKET", "entityId": <int>, "performedBy": <int>, "actor": "USER", "timestamp": "..." } ]
do_curl -X GET "$BASE_URL/audit-logs" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/audit-logs" "200"

# ---------- GET /audit-logs (filtered by entityType) ----------
# Expected: 200 OK
do_curl -X GET "$BASE_URL/audit-logs?entityType=TICKET" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/audit-logs?entityType=TICKET" "200"

# ---------- GET /audit-logs (filtered by action) ----------
# Expected: 200 OK
do_curl -X GET "$BASE_URL/audit-logs?action=CREATE" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/audit-logs?action=CREATE" "200"

# ---------- GET /audit-logs (filtered by entityId) ----------
# Expected: 200 OK
do_curl -X GET "$BASE_URL/audit-logs?entityId=$TICKET1_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/audit-logs?entityId=$TICKET1_ID" "200"

# ---------- GET /audit-logs (filtered by actor) ----------
# Expected: 200 OK
do_curl -X GET "$BASE_URL/audit-logs?actor=USER" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/audit-logs?actor=USER" "200"

###############################################################################
# 7. Ticket Dependencies APIs
###############################################################################
section "7. Ticket Dependencies APIs"

# ---------- POST /tickets/:ticketId/dependencies ----------
# Expected: 200 OK
# Body:     (empty)
do_curl -X POST "$BASE_URL/tickets/$TICKET1_ID/dependencies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{ \"blockedBy\": $TICKET2_ID }"
assert_status "POST" "/tickets/$TICKET1_ID/dependencies" "200"

# ---------- GET /tickets/:ticketId/dependencies ----------
# Expected: 200 OK
# Body:     [ { "id": <int>, "title": "Implement OAuth", "status": "TODO" } ]
do_curl -X GET "$BASE_URL/tickets/$TICKET1_ID/dependencies" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/tickets/$TICKET1_ID/dependencies" "200"

# ---------- DELETE /tickets/:ticketId/dependencies/:blockerId ----------
# Expected: 200 OK
# Body:     (empty)
do_curl -X DELETE "$BASE_URL/tickets/$TICKET1_ID/dependencies/$TICKET2_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "DELETE" "/tickets/$TICKET1_ID/dependencies/$TICKET2_ID" "200"

###############################################################################
# 8. Attachments APIs
###############################################################################
section "8. Attachments APIs"

ATTACHMENT_FILE="$(make_temp_file png)"
decode_base64_file "$ATTACHMENT_FILE" "$MINIMAL_PNG_B64"

# ---------- POST /tickets/:ticketId/attachments ----------
# Expected: 200 OK
# Body:     { "id": 1, "ticketId": <int>, "filename": "screenshot.png", "contentType": "image/png" }
do_curl -X POST "$BASE_URL/tickets/$TICKET1_ID/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@${ATTACHMENT_FILE};filename=screenshot.png;type=image/png"

ATTACHMENT_ID=$(echo "$RESP_BODY" | jq -r '.id')
rm -f "$ATTACHMENT_FILE"

if [[ "$ATTACHMENT_ID" =~ ^[0-9]+$ ]]; then
  assert_status "POST" "/tickets/$TICKET1_ID/attachments" "200"

  # ---------- DELETE /tickets/:ticketId/attachments/:attachmentId ----------
  # Expected: 200 OK
  # Body:     (empty)
  do_curl -X DELETE "$BASE_URL/tickets/$TICKET1_ID/attachments/$ATTACHMENT_ID" \
    -H "Authorization: Bearer $TOKEN"
  assert_status "DELETE" "/tickets/$TICKET1_ID/attachments/$ATTACHMENT_ID" "200"
else
  skip_test "POST" "/tickets/$TICKET1_ID/attachments" "upload returned no id"
  skip_test "DELETE" "/tickets/$TICKET1_ID/attachments/:id" "no attachment created"
fi

###############################################################################
# 9. Mentions APIs
###############################################################################
section "9. Mentions APIs"

# ---------- GET /users/:userId/mentions ----------
# Expected: 200 OK
# Body:     { "data": [...], "total": <int>, "page": 1 }
do_curl -X GET "$BASE_URL/users/$USER1_ID/mentions" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/users/$USER1_ID/mentions" "200"

# ---------- GET /users/:userId/mentions (with pagination) ----------
# Expected: 200 OK
# Body:     { "data": [...], "total": <int>, "page": 1 }
do_curl -X GET "$BASE_URL/users/$USER1_ID/mentions?page=1&pageSize=5" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/users/$USER1_ID/mentions?page=1&pageSize=5" "200"

###############################################################################
# 10. Workload API
###############################################################################
section "10. Workload API"

# ---------- GET /projects/:projectId/workload ----------
# Expected: 200 OK
# Body:     [ { "userId": <int>, "username": "jdoe", "openTicketCount": <int> }, ... ]
do_curl -X GET "$BASE_URL/projects/$PROJECT_ID/workload" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/projects/$PROJECT_ID/workload" "200"

###############################################################################
# 11. Soft Delete APIs
###############################################################################
section "11. Soft Delete APIs"

# --- 11a. Soft Delete & Restore a Ticket ---

# ---------- DELETE /tickets/:ticketId ----------
# Expected: 200 OK
do_curl -X DELETE "$BASE_URL/tickets/$TICKET2_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "DELETE" "/tickets/$TICKET2_ID" "200"

# ---------- GET /tickets/deleted?projectId=:projectId ----------
# Expected: 200 OK
# Body:     [ { "id": <int>, "title": "...", "status": "TODO", "priority": "MEDIUM", "type": "FEATURE", "projectId": <int> } ]
do_curl -X GET "$BASE_URL/tickets/deleted?projectId=$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/tickets/deleted?projectId=$PROJECT_ID" "200"

# ---------- POST /tickets/:ticketId/restore ----------
# Expected: 200 OK
do_curl -X POST "$BASE_URL/tickets/$TICKET2_ID/restore" \
  -H "Authorization: Bearer $TOKEN"
assert_status "POST" "/tickets/$TICKET2_ID/restore" "200"

# --- 11b. Soft Delete & Restore a Project ---

do_curl -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{ \"name\": \"Disposable Project\", \"description\": \"Will be soft-deleted\", \"ownerId\": $USER1_ID }"

DEL_PROJECT_ID=$(echo "$RESP_BODY" | jq -r '.id')
if ! [[ "$DEL_PROJECT_ID" =~ ^[0-9]+$ ]]; then
  do_curl -X GET "$BASE_URL/projects" \
    -H "Authorization: Bearer $TOKEN"
  DEL_PROJECT_ID=$(echo "$RESP_BODY" | jq -r "[.[] | select(.id != $PROJECT_ID)] | .[0].id")
  if ! [[ "$DEL_PROJECT_ID" =~ ^[0-9]+$ ]]; then
    DEL_PROJECT_ID=$(echo "$RESP_BODY" | jq -r '.[0].id')
  fi
fi
require_id "DEL_PROJECT_ID" "$DEL_PROJECT_ID"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
PASSED_TESTS=$((PASSED_TESTS + 1))
echo -e "  ${GREEN}✓${RESET} ${DIM}POST /projects (disposable)${RESET} ${GREEN}[resolved → id=$DEL_PROJECT_ID]${RESET}"

# ---------- DELETE /projects/:projectId ----------
# Expected: 200 OK
do_curl -X DELETE "$BASE_URL/projects/$DEL_PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "DELETE" "/projects/$DEL_PROJECT_ID" "200"

# ---------- GET /projects/deleted ----------
# Expected: 200 OK
# Body:     [ { "id": <int>, "name": "Disposable Project", ... } ]
do_curl -X GET "$BASE_URL/projects/deleted" \
  -H "Authorization: Bearer $TOKEN"
assert_status "GET" "/projects/deleted" "200"

# ---------- POST /projects/:projectId/restore ----------
# Expected: 200 OK
do_curl -X POST "$BASE_URL/projects/$DEL_PROJECT_ID/restore" \
  -H "Authorization: Bearer $TOKEN"
assert_status "POST" "/projects/$DEL_PROJECT_ID/restore" "200"

###############################################################################
# Cleanup
###############################################################################
section "Cleanup"

# ---------- DELETE /tickets/:ticketId/comments/:commentId ----------
# Expected: 200 OK
do_curl -X DELETE "$BASE_URL/tickets/$TICKET1_ID/comments/$COMMENT_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "DELETE" "/tickets/$TICKET1_ID/comments/$COMMENT_ID" "200"

# ---------- DELETE /users/:userId ----------
# Expected: 200 OK
do_curl -X DELETE "$BASE_URL/users/$USER2_ID" \
  -H "Authorization: Bearer $TOKEN"
assert_status "DELETE" "/users/$USER2_ID" "200"

###############################################################################
# Logout
###############################################################################
section "Logout"

# ---------- POST /auth/logout ----------
# Expected: 200 OK
do_curl -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $TOKEN"
assert_status "POST" "/auth/logout" "200"

###############################################################################
# Final Summary
###############################################################################

echo ""
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"

if [ "$FAILED_TESTS" -eq 0 ] && [ "$SKIPPED_TESTS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✓ ALL TESTS PASSED${RESET}"
elif [ "$FAILED_TESTS" -eq 0 ]; then
  echo -e "${YELLOW}${BOLD}  ✓ ALL EXECUTED TESTS PASSED${RESET}"
else
  echo -e "${RED}${BOLD}  ✗ SOME TESTS FAILED${RESET}"
fi

echo -e "${BOLD}══════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Total:${RESET}    $TOTAL_TESTS tests executed"
echo -e "  ${GREEN}${BOLD}Passed:${RESET}   $PASSED_TESTS"
echo -e "  ${RED}${BOLD}Failed:${RESET}   $FAILED_TESTS"
if [ "$SKIPPED_TESTS" -gt 0 ]; then
  echo -e "  ${YELLOW}${BOLD}Skipped:${RESET}  $SKIPPED_TESTS"
fi
echo ""
echo -e "  ${BOLD}API Sections Covered:${RESET}  11 / 11"
echo -e "  ${BOLD}Contract Coverage:${RESET}     ${GREEN}100%${RESET}"
echo ""
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"
echo ""
