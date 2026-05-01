// PM2 process manifest for co-op.
//
// Usage:
//   npm run build                 # one-time: next build
//   npm run pm2:start             # start under PM2
//   npm run pm2:logs              # tail combined logs
//   npm run pm2:stop              # stop
//   npm run pm2:reload            # zero-downtime reload
//   pm2 save && pm2 startup       # (host-level) persist across reboots
//
// Notes:
//   - Fork mode, single instance. The in-process scheduler (instrumentation.ts)
//     fires reminders/schedules; running >1 replica would race on ScheduledJob
//     rows until we add a Postgres advisory lock inside runTick(). If you need
//     to scale horizontally, set COOP_INPROC_CRON=0 on all replicas and put
//     the cron tick behind an external scheduler instead.
//   - `autorestart: true` + `min_uptime` prevents restart-loops on a genuinely
//     broken build (PM2 gives up after `max_restarts` within the window).
//   - Logs merged to ./logs/ so `pm2:logs` is useful.

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'co-op',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      exec_mode: 'fork',
      instances: 1,

      // Crash-recovery policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10_000,

      // Node / memory
      node_args: '--enable-source-maps',
      max_memory_restart: '1G',

      // Logs
      out_file: path.join(__dirname, 'logs/co-op.out.log'),
      error_file: path.join(__dirname, 'logs/co-op.err.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',
      time: true,

      env: {
        NODE_ENV: 'production',
        // PORT, DATABASE_URL, ANTHROPIC_API_KEY, APP_ENCRYPTION_KEY, etc.
        // come from the host environment / your .env file; PM2 passes them through.
        PORT: process.env.PORT || '3000',
      },
    },
  ],
};
