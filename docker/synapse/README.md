# Synapse local-dev configuration

`homeserver.yaml` and `coop.local.log.config` are committed and shared. The
**signing key is not** — every deployment must generate its own. Sharing a
signing key would let any other clone forge messages on your homeserver.

## First-time setup

If `coop.local.signing.key` doesn't exist yet (a fresh clone, or you just
removed it), generate one:

```bash
# From the repo root
docker run --rm \
  -v "$(pwd)/docker/synapse:/data" \
  -e SYNAPSE_SERVER_NAME=coop.local \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate
```

That writes a fresh `coop.local.signing.key` (and re-writes
`homeserver.yaml`/`coop.local.log.config` — diff before keeping the
config changes if you've edited them).

Then bring the stack up as usual:

```bash
docker compose up -d
```

## Creating the admin user

Synapse needs one admin user before the app can provision agent accounts.
Once Synapse is running:

```bash
docker compose exec synapse \
  register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008
```

Pick a username + password, answer **yes** to "Make admin". Then log in
once via curl to capture the access token:

```bash
curl -s -XPOST http://localhost:8008/_matrix/client/r0/login \
  -H 'Content-Type: application/json' \
  -d '{"type":"m.login.password","user":"<admin>","password":"<password>"}' \
  | jq -r .access_token
```

Paste that into `MATRIX_ADMIN_TOKEN` in `.env`.

## What's gitignored

- `*.signing.key` — per-deployment identity, never share.
- `media_store/` — user-uploaded media.
- `homeserver.db` — Synapse's internal SQLite (we use Postgres in
  `docker-compose.yml`, so this only appears if you run Synapse outside
  compose with default config).
- `*.log` — runtime logs.
