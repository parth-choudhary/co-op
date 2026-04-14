# External Integrations

**Analysis Date:** 2026-04-14

## APIs & External Services

**Chat / Realtime (Matrix protocol):**
- Synapse homeserver (Matrix) - Powers project chat rooms, channels, direct messages, and media uploads
  - Deployment: self-hosted via `docker-compose.yml` service `synapse` (image `matrixdotorg/synapse:latest`, port `8008`, server name `coop.local`)
  - Config: `docker/synapse/homeserver.yaml`, signing key `docker/synapse/coop.local.signing.key`, log config `docker/synapse/coop.local.log.config`, media at `docker/synapse/media_store/`
  - SDK/Client: no JS SDK; direct `fetch` against Matrix Client-Server API v3 and Synapse Admin API v2 (`src/lib/matrix.ts`)
  - Auth: `MATRIX_ADMIN_TOKEN` (admin) and per-user access tokens obtained via password login (`loginMatrixUser` in `src/lib/matrix.ts`)
  - Endpoints consumed (from `src/lib/matrix.ts`):
    - `PUT /_synapse/admin/v2/users/@{localpart}:coop.local` - Register user
    - `POST /_matrix/client/v3/login` - Login, get access token
    - `POST /_matrix/client/v3/createRoom` - Create private room
    - `GET /_matrix/client/v3/joined_rooms` - List rooms
    - `GET /_matrix/client/v3/rooms/{roomId}/state` - Room state
    - `PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}` - Send message
    - `POST /_matrix/media/v3/upload` - Upload media
    - `GET /_matrix/media/v3/download/{server}/{mediaId}` - Download media (via `mxcToHttp`)
  - Callers: `src/app/api/chat/token/route.ts` (token exchange), `src/app/api/chat/rooms/route.ts` (room/channel creation)

**AI Model Providers (configured, not yet invoked server-side):**
- Anthropic (Claude) - Default provider for `AIAgent` records (`modelProvider: 'anthropic'`, default model `claude-sonnet-4-20250514`); see `src/app/api/agents/route.ts`, `src/app/(dashboard)/p/[projectId]/agents/page.tsx`
- OpenAI (GPT) - Alternate provider option (`gpt-4o`) surfaced in the agent creation UI
- API keys for these providers are stored per-project in the `ModelKey` table (`prisma/schema.prisma`) via `src/app/api/model-keys/route.ts` and `src/app/api/model-keys/[id]/route.ts`
- No provider SDKs are currently imported (`@anthropic-ai/sdk`, `openai`, etc. are not in `package.json`); keys are persisted as `keyEncrypted` but no outbound calls to the providers exist in the codebase yet

## Data Storage

**Databases:**
- PostgreSQL 16 (primary application DB)
  - Connection: `DATABASE_URL` env var; dev fallback `postgresql://coop:coop@localhost:5433/coop`
  - Client: `@prisma/client` 7 via `@prisma/adapter-pg` over a `pg.Pool` (`src/lib/db.ts`)
  - Schema: `prisma/schema.prisma` (models: `Company`, `User`, `Project`, `ProjectMember`, `AIAgent`, `ModelKey`, `Board`, `Column`, `Card`, `Comment`, `Checklist`, `ChecklistItem`, `Attachment`, `CardActivity`, `CardMember`, `ChatChannel`)
  - Migrations: `prisma/migrations/20260414071353_init`, `..._add_card_features`, `..._add_chat_channel`, `..._project_centric_restructure`
  - Local instance: `docker-compose.yml` service `db` (Postgres 16-alpine, host port `5433` → container `5432`)
- PostgreSQL 16 (Synapse-internal)
  - Separate `synapse-db` service in `docker-compose.yml`; used by the Matrix homeserver, not touched by application code

**File Storage:**
- Matrix media repository (Synapse) - File uploads routed via `uploadMedia` in `src/lib/matrix.ts`; media persisted under `docker/synapse/media_store/`
- `Attachment` records in the app DB store `url`, `mimeType`, `size`, `uploadedById` (`prisma/schema.prisma`)

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- NextAuth v5 (beta) - Configured in `src/lib/auth.ts`
  - Strategy: JWT sessions (`session: { strategy: 'jwt' }`)
  - Provider: `Credentials` (email + password); password verified with `bcryptjs` against `User.passwordHash`
  - Custom JWT/session callbacks propagate `companyId`, `companyName`, `role` onto the session user
  - Sign-in page: `/login` (`src/app/login/page.tsx`)
  - Route handler: `src/app/api/auth/[...nextauth]/` (directory present)
  - Registration: `POST /api/auth/register` (`src/app/api/auth/register/route.ts`) creates a `Company` + owner `User` in a single Prisma transaction, hashing the password with `bcrypt.hash(password, 12)`

**Matrix identity linkage:**
- Each `User` is mirrored to a Matrix user `@coop_{userId}:coop.local` on demand (`src/app/api/chat/token/route.ts`)
- Matrix password is deterministically derived from `userId` + first 8 chars of `NEXTAUTH_SECRET` (`generateMatrixPassword` in `src/lib/matrix.ts`) — note: this couples Matrix password rotation to `NEXTAUTH_SECRET`
- Similar linkage fields exist for agents (`AIAgent.matrixUserId`), projects (`Project.matrixRoomId`), and channels (`ChatChannel.matrixRoomId`)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Datadog/etc.)

**Logs:**
- `console.error` used ad hoc in API routes (e.g., `src/app/api/auth/register/route.ts`)
- Synapse-side logging controlled by `docker/synapse/coop.local.log.config`

## CI/CD & Deployment

**Hosting:**
- Not specified; no platform-specific config files (no `vercel.json`, no `Dockerfile` for the app, no Kubernetes manifests)

**CI Pipeline:**
- None (no `.github/workflows/`, no `.gitlab-ci.yml`, no `circleci`/`travis` config)

**Local orchestration:**
- `docker-compose.yml` brings up `db`, `synapse`, and `synapse-db` with healthchecks on both Postgres services

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - App Postgres connection
- `NEXTAUTH_SECRET` - NextAuth signing + Matrix password seed
- `MATRIX_HOMESERVER_URL` - Synapse base URL (falls back to `http://localhost:8008`)
- `MATRIX_ADMIN_TOKEN` - Synapse admin bearer token (falls back to empty string, which disables admin endpoints)

**Secrets location:**
- No `.env*` files present in the repo at time of analysis
- Consumed directly via `process.env.*` in `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/matrix.ts`, `src/app/api/chat/token/route.ts`
- Synapse signing key committed in-repo at `docker/synapse/coop.local.signing.key` (local development convenience)

## Webhooks & Callbacks

**Incoming:**
- NextAuth catch-all handler at `src/app/api/auth/[...nextauth]/` (handles NextAuth's own callback/signin/signout routes)
- No third-party webhook endpoints detected (no Stripe/GitHub/etc. handlers)

**Outgoing:**
- Outbound HTTP from the app only targets the Synapse homeserver via `matrixFetch` (`src/lib/matrix.ts`)
- No outbound calls to AI providers are currently wired up (despite provider config being stored)

---

*Integration audit: 2026-04-14*
