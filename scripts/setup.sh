#!/usr/bin/env bash
# Co-Op single-command setup.
# Idempotent: safe to re-run. Each step skips when already done.
#
# Usage:
#   scripts/setup.sh           Bring up the stack, run migrations, leave dev server stopped
#   scripts/setup.sh --start   Same, then `npm run dev` in the foreground

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

START_DEV=0
for arg in "$@"; do
  case "$arg" in
    --start) START_DEV=1 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;32m▶\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. Prerequisites ----------------------------------------------------
log "Checking prerequisites"
command -v node   >/dev/null || fail "node not found — install Node.js 20+"
command -v npm    >/dev/null || fail "npm not found"
command -v docker >/dev/null || fail "docker not found"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20+ required (have $(node -v))"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "docker compose plugin not found"
fi

# --- 2. npm install ------------------------------------------------------
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  log "Installing npm dependencies"
  npm install
else
  log "npm dependencies up to date"
fi

# --- 3. .env -------------------------------------------------------------
if [ ! -f .env ]; then
  log "Creating .env from .env~"
  cp .env~ .env
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  # Replace the placeholder secret. Use a different delimiter since base64 may contain /.
  if grep -q '^NEXTAUTH_SECRET=' .env; then
    node -e "
      const fs=require('fs');
      const p='.env';
      let s=fs.readFileSync(p,'utf8');
      s=s.replace(/^NEXTAUTH_SECRET=.*$/m,'NEXTAUTH_SECRET=\"' + process.argv[1] + '\"');
      fs.writeFileSync(p,s);
    " "$SECRET"
  fi
  # Drop the dev token from .env~ so the admin step below regenerates a real one.
  node -e "
    const fs=require('fs');
    const p='.env';
    let s=fs.readFileSync(p,'utf8');
    s=s.replace(/^MATRIX_ADMIN_TOKEN=.*$/m,'MATRIX_ADMIN_TOKEN=\"\"');
    fs.writeFileSync(p,s);
  "
  if ! grep -q '^COOP_LOCAL_MODE=' .env; then
    printf '\nCOOP_LOCAL_MODE="1"\n' >> .env
  fi
else
  log ".env already exists — leaving as-is"
fi

# Helper: read a key from .env (returns empty string if absent)
env_get() {
  node -e "
    const fs=require('fs');
    if(!fs.existsSync('.env')){process.exit(0)}
    const m=fs.readFileSync('.env','utf8').match(new RegExp('^'+process.argv[1]+'=\"?([^\"\\n]*)\"?','m'));
    if(m)process.stdout.write(m[1]);
  " "$1"
}

env_set() {
  local key="$1" val="$2"
  node -e "
    const fs=require('fs');
    const p='.env';
    const k=process.argv[1], v=process.argv[2];
    let s=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
    const line=k+'=\"'+v+'\"';
    if(new RegExp('^'+k+'=','m').test(s)){
      s=s.replace(new RegExp('^'+k+'=.*$','m'),line);
    } else {
      if(s && !s.endsWith('\n')) s+='\n';
      s+=line+'\n';
    }
    fs.writeFileSync(p,s);
  " "$key" "$val"
}

# --- 4. Synapse signing key ---------------------------------------------
if [ ! -f docker/synapse/coop.local.signing.key ]; then
  log "Generating Synapse signing key (per-deployment, gitignored)"
  docker run --rm \
    -v "$ROOT/docker/synapse:/data" \
    -e SYNAPSE_SERVER_NAME=coop.local \
    -e SYNAPSE_REPORT_STATS=no \
    matrixdotorg/synapse:latest generate >/dev/null
else
  log "Synapse signing key exists"
fi

# --- 5. docker compose up ------------------------------------------------
log "Starting Postgres + Synapse via docker compose"
$DC up -d

wait_for() {
  local name="$1" cmd="$2" tries="${3:-60}"
  printf '   waiting for %s' "$name"
  for _ in $(seq 1 "$tries"); do
    if eval "$cmd" >/dev/null 2>&1; then
      printf ' ready\n'
      return 0
    fi
    printf '.'
    sleep 2
  done
  printf '\n'
  fail "$name never became ready"
}

wait_for "postgres"  "$DC exec -T db pg_isready -U coop"
wait_for "synapse"   "curl -fsS http://localhost:8008/_matrix/client/versions"

# --- 6. Prisma migrate ---------------------------------------------------
log "Running Prisma migrations"
npx prisma migrate deploy
npx prisma generate

# --- 7. Synapse admin token ---------------------------------------------
ADMIN_TOKEN="$(env_get MATRIX_ADMIN_TOKEN)"

token_works() {
  [ -n "$1" ] || return 1
  curl -fsS -H "Authorization: Bearer $1" \
    "http://localhost:8008/_synapse/admin/v1/server_version" >/dev/null 2>&1
}

if token_works "$ADMIN_TOKEN"; then
  log "MATRIX_ADMIN_TOKEN already valid"
else
  log "Provisioning Synapse admin user"
  ADMIN_USER="coopadmin"
  ADMIN_PASS="$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')"

  # register_new_matrix_user is idempotent-ish: it errors if user exists.
  # We don't care — we just need a working login.
  if ! $DC exec -T synapse register_new_matrix_user \
        -c /data/homeserver.yaml \
        -u "$ADMIN_USER" -p "$ADMIN_PASS" -a \
        http://localhost:8008 >/dev/null 2>&1; then
    warn "Admin user '$ADMIN_USER' may already exist — attempting login with a fresh password reset"
    # If the user exists with a different password, reset via admin API requires
    # an existing token, which we don't have. Tell the user how to recover.
    cat >&2 <<EOF

Could not auto-create the Synapse admin user. This usually means one already
exists from a previous setup. To recover, either:

  1. Re-use a known token: paste it into MATRIX_ADMIN_TOKEN in .env, then
     re-run this script.
  2. Wipe Synapse state: \`$DC down -v\` then re-run this script (this
     destroys all chat history).

EOF
    exit 1
  fi

  LOGIN_JSON="$(curl -fsS -XPOST http://localhost:8008/_matrix/client/r0/login \
    -H 'Content-Type: application/json' \
    -d "{\"type\":\"m.login.password\",\"user\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")"
  TOKEN="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).access_token)' <<<"$LOGIN_JSON")"
  [ -n "$TOKEN" ] || fail "Synapse login returned no access_token"
  env_set MATRIX_ADMIN_TOKEN "$TOKEN"
  log "MATRIX_ADMIN_TOKEN written to .env"
fi

# --- 8. Provision agents (no-op if none exist yet) ----------------------
log "Provisioning Matrix accounts for any agents missing one"
npx tsx scripts/provision-agent-matrix.ts || warn "agent provisioning step failed (safe to re-run later)"

log "Setup complete."
echo
echo "Next:"
echo "  npm run dev          # start the dev server on http://localhost:3000"
echo "  npm run pm2:start    # or run via PM2 (see docs/deploy-pm2.md)"
echo

if [ "$START_DEV" -eq 1 ]; then
  log "Starting dev server"
  exec npm run dev
fi
