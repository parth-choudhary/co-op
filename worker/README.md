# co-op worker

Tiny Node daemon that runs coding agents on a VM you control. Used when a
co-op project's Code Automation execution mode is set to **SSH dev box**.

## What it does

1. Listens on `:8787` for `POST /jobs` from the co-op orchestrator.
2. Verifies an HMAC signature on every request (`X-Coop-Signature: t=…,v1=…`).
3. Clones the target repo with a short-lived GitHub App installation token.
4. Runs `@anthropic-ai/claude-code` headless against the task brief.
5. Commits, pushes the branch, opens a PR via the GitHub REST API.
6. Posts status updates back to the co-op app at `callbackUrl` (also signed).

The worker is intentionally stateless. The orchestrator is the source of truth;
the worker just executes what it's told.

## Deploy

### Docker

```bash
docker build -t coop-worker .
docker run -d --name coop-worker \
  -p 8787:8787 \
  -e COOP_WORKER_SECRET="$(openssl rand -hex 32)" \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v coop-work:/var/coop/work \
  coop-worker
```

Then in co-op project settings → Code Automation:

- Execution mode: **Self-hosted dev box (SSH)**
- Host: `https://your-vm.example.com:8787` (or the bare hostname; `https://` is added if missing)
- Save the same `COOP_WORKER_SECRET` value as the env var on this app.

### Systemd (no Docker)

```bash
git clone https://github.com/your/co-op
cd co-op/worker
npm install
npm run build
COOP_WORKER_SECRET=… ANTHROPIC_API_KEY=… node dist/server.js
```

A sample unit file:

```ini
[Unit]
Description=co-op coding worker
After=network.target

[Service]
Environment="COOP_WORKER_SECRET=…"
Environment="ANTHROPIC_API_KEY=…"
Environment="COOP_WORK_ROOT=/var/coop/work"
ExecStart=/usr/bin/node /opt/coop-worker/dist/server.js
Restart=on-failure
User=coop

[Install]
WantedBy=multi-user.target
```

## Environment

| Var | Required | Notes |
|---|---|---|
| `COOP_WORKER_SECRET` | yes | Shared HMAC secret with the co-op app |
| `ANTHROPIC_API_KEY` | yes | Used by Claude Code |
| `COOP_WORK_ROOT` | no | Default `/var/coop/work` |
| `PORT` | no | Default `8787` |
| `KEEP_WORKDIR` | no | Set to keep `/var/coop/work/<runId>` after a job (debugging) |

## Security notes

- TLS is **your responsibility** — terminate at a reverse proxy (nginx,
  Caddy) and forward to `:8787`. The HMAC layer protects body integrity but
  not transport.
- The worker should run as a low-privilege user with no sudo and no SSH keys.
- The installation token is single-job and short-lived; do not log it.
- If the VM is multi-tenant, run each job inside a fresh container or VM
  rather than just a worktree directory.

## Development

```bash
npm install
COOP_WORKER_SECRET=devsecret npm run dev
# in another shell, smoke-test:
curl -s http://localhost:8787/health
```
