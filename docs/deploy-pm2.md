# Running co-op under PM2

For self-hosted deployments (bare metal, VMs, Docker hosts) PM2 keeps the Next.js server alive and restarts it on crash.

## First boot

```bash
# Install deps and build
npm ci
npx prisma migrate deploy
npm run build

# Start under PM2
npm run pm2:start           # uses ecosystem.config.cjs
npm run pm2:status          # check it's online
npm run pm2:logs            # tail combined logs
```

That's it — one Next.js process, fork mode, auto-restart, in-process scheduler tick (reminders / recurring jobs) running inside it.

## Persistence across host reboots

Once, as the user that owns the process:

```bash
pm2 save                          # snapshot the running process list
pm2 startup systemd               # prints a line to run as root — do so
```

After that, the host's init system will re-spawn PM2 on boot and PM2 will re-spawn co-op.

## Day-to-day

| Task | Command |
|---|---|
| Redeploy (zero-downtime) | `git pull && npm ci && npm run build && npm run pm2:reload` |
| Restart (downtime) | `npm run pm2:restart` |
| Stop | `npm run pm2:stop` |
| Remove from PM2 | `npm run pm2:delete` |
| Live logs | `npm run pm2:logs` |
| Files on disk | `logs/co-op.out.log`, `logs/co-op.err.log` |

## Environment

PM2 inherits the shell's env. Two sane options:

- **`.env` file** (next-auth / Prisma already read it): keep `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, etc. there.
- **Host env vars** (systemd unit / `EnvironmentFile=`): set them before `pm2 start`.

The config passes `NODE_ENV=production` and `PORT` through. Everything else is read from the parent environment at spawn time. After editing env, use `pm2 reload` with `--update-env` (already wired) so changes take effect.

## Crash policy

Set in `ecosystem.config.cjs`:

- `autorestart: true` — restart on non-zero exit.
- `max_restarts: 10` in a `min_uptime: 10s` window — gives up on a genuinely broken build instead of burning CPU in a loop.
- `exp_backoff_restart_delay: 100` — backs off if the process keeps dying quickly.
- `max_memory_restart: '1G'` — auto-restart if RSS exceeds 1 GB (leak guard).
- `kill_timeout: 10_000` — gives the Node process 10 s to finish in-flight requests on `reload`/`stop` before SIGKILL.

## Scaling caveats (read before setting `instances: > 1`)

The in-process scheduler in `src/instrumentation.ts` fires `ScheduledJob` rows from the DB. With >1 PM2 instances (cluster mode or multiple hosts), all instances race on the same rows. Two safe options:

1. **One "cron leader" host.** Leave `instances: 1` on one host and `COOP_INPROC_CRON=0` on the others. Set `COOP_CRON_TOKEN` and point an external pinger at one host's `/api/cron/agents/tick` if you prefer external cron.
2. **Add a Postgres advisory lock inside `runTick()`.** Wrap each job's update in a per-job `pg_advisory_xact_lock`. Safe at any replica count. This isn't done yet; see `docs/openclaw-compat.md` for the exact pattern we already use elsewhere.

## When NOT to use PM2

- **Vercel:** the platform manages the server process. Don't run PM2 — `vercel.json` drives cron.
- **AWS Lambda / Netlify / Cloudflare Pages:** same, they own the lifecycle. PM2 doesn't apply.
- **Docker with an orchestrator (Kubernetes, Nomad, ECS):** let the orchestrator handle restarts (`restartPolicy: always`). Running PM2 inside the container duplicates the responsibility and confuses healthchecks.

PM2 is for a long-lived Node process on a host you own.
