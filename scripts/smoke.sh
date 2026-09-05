#!/usr/bin/env bash
# End-to-end smoke test for the BDCraft webshop.
# Requires: .env with DATABASE_URL + ADMIN_USER/ADMIN_PASSWORD, node_modules installed.
# Creates ONE test order (mc_username=smoketester) and deletes it (plus any
# leftovers from previous runs) afterwards, so it is safe against the real DB.
set -u
cd "$(dirname "$0")/.."
ROOT="$PWD"

PORT=3111
BASE="http://127.0.0.1:$PORT"
JAR=/tmp/bdcraft-smoke-cookies.txt
LOG=/tmp/bdcraft-smoke.log
rm -f "$JAR" "$LOG"

ADMIN_USER=$(grep -E '^ADMIN_USER=' .env | cut -d= -f2)
ADMIN_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2)
[ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASS" ] || { echo "FAIL: ADMIN_USER/ADMIN_PASSWORD missing in .env"; exit 1; }

# DB helper (loads DATABASE_URL from .env)
dbq() { node -r dotenv/config -e "$1" 2>/dev/null; }

cleanup() {
  dbq "
    const {Pool}=require('pg'); const p=new Pool({ssl:process.env.DATABASE_URL.includes('sslmode=disable')?false:{rejectUnauthorized:false}});
    (async()=>{ await p.query(\"DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE mc_username='smoketester' OR trx_id LIKE 'SMOKE%')\");
    const {rows}=await p.query(\"DELETE FROM orders WHERE mc_username='smoketester' OR trx_id LIKE 'SMOKE%' RETURNING id\");
    console.log('cleanup: removed', rows.length, 'test orders'); await p.end(); })().catch(e=>{console.error(e);process.exit(1)});
  "
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null
}
trap cleanup EXIT

export PORT
node src/index.js > "$LOG" 2>&1 &
SRV_PID=$!

echo "== waiting for /health =="
ok=0
for i in $(seq 1 60); do
  if curl -s -m 2 "$BASE/health" | grep -q '"ok":true'; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { echo "FAIL: server never became healthy"; tail -30 "$LOG"; exit 1; }
echo "PASS: /health ok"

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(code "$BASE/")" = 200 ] && echo "PASS: GET /" || echo "FAIL: GET /"
[ "$(code "$BASE/shop")" = 200 ] && echo "PASS: GET /shop" || echo "FAIL: GET /shop"

PRODUCT=$(curl -s "$BASE/shop" | grep -o 'name="productId" value="[0-9]*"' | head -1 | grep -o '[0-9]*')
if [ -z "$PRODUCT" ]; then echo "FAIL: no product on /shop"; exit 1; fi
echo "PASS: shop lists products (first id=$PRODUCT)"

curl -s -c "$JAR" -b "$JAR" -d "productId=$PRODUCT&qty=2" -o /dev/null "$BASE/cart/add"
[ "$(code -c "$JAR" -b "$JAR" "$BASE/cart")" = 200 ] && echo "PASS: add-to-cart + GET /cart" || echo "FAIL: cart"

TRX="SMOKE-$$-$RANDOM"
REDIR=$(curl -s -c "$JAR" -b "$JAR" -d "mc_username=smoketester&contact=01712345678&payment_method=bkash&trx_id=$TRX&note=automated smoke test" -o /dev/null -w '%{redirect_url}' "$BASE/checkout")
CODE=${REDIR##*/}
echo "checkout redirect -> ${REDIR:-<none>}"
case "$CODE" in BDC-*) echo "PASS: order created ($CODE)";; *) echo "FAIL: no order code (redirect=$REDIR)"; exit 1;; esac

[ "$(code "$BASE/order/$CODE")" = 200 ] && echo "PASS: tracking page /order/$CODE" || echo "FAIL: tracking page"

# Admin: login, confirm order, verify it flips to paid
LOGIN=$(code -c "$JAR" -b "$JAR" -d "user=$ADMIN_USER&password=$ADMIN_PASS" -o /dev/null "$BASE/admin/login")
[ "$LOGIN" = 302 ] && echo "PASS: admin login" || echo "FAIL: admin login (HTTP $LOGIN)"
[ "$(code -c "$JAR" -b "$JAR" "$BASE/admin")" = 200 ] && echo "PASS: admin dashboard" || echo "FAIL: admin dashboard"

OID=$(dbq "
  const {Pool}=require('pg'); const p=new Pool({ssl:process.env.DATABASE_URL.includes('sslmode=disable')?false:{rejectUnauthorized:false}});
  p.query(\"SELECT id FROM orders WHERE order_code='$CODE'\").then(r=>{console.log(r.rows[0].id);return p.end();});
")
[ -n "$OID" ] && echo "PASS: order row found (id=$OID)" || { echo "FAIL: order row missing"; exit 1; }

[ "$(code -c "$JAR" -b "$JAR" -o /dev/null -d '' -X POST "$BASE/admin/orders/$OID/paid")" = 302 ] && echo "PASS: admin marks PAID" || echo "FAIL: mark paid"
STATUS=$(dbq "
  const {Pool}=require('pg'); const p=new Pool({ssl:process.env.DATABASE_URL.includes('sslmode=disable')?false:{rejectUnauthorized:false}});
  p.query(\"SELECT status FROM orders WHERE order_code='$CODE'\").then(r=>{console.log(r.rows[0].status);return p.end();});
")
[ "$STATUS" = "paid" ] && echo "PASS: DB status = paid (plugin will now pick it up)" || echo "FAIL: expected paid, got '$STATUS'"

echo "== smoke test done (test order cleaned up on exit) =="
