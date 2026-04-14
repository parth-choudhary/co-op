# Technology Stack

**Analysis Date:** 2026-04-14

## Languages

**Primary:**
- TypeScript ^5 - All application code (`src/**/*.ts`, `src/**/*.tsx`); strict mode enabled per `tsconfig.json`
- SQL (PostgreSQL dialect) - Prisma migrations under `prisma/migrations/`

**Secondary:**
- CSS - Global styles and CSS modules (`src/styles/globals.css`, `src/styles/tokens.css`, `*.module.css`)
- YAML - Docker/Synapse configuration (`docker-compose.yml`, `docker/synapse/homeserver.yaml`)

## Runtime

**Environment:**
- Node.js (Next.js 16 requires Node 18.18+; `.nvmrc` not present)
- Next.js App Router server runtime (route handlers in `src/app/api/**/route.ts`)
- Browser runtime for React 19 client components

**Package Manager:**
- npm (inferred from `package-lock.json` at project root, lockfileVersion 3)
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- Next.js 16.2.3 - Full-stack framework (App Router); config in `next.config.ts`
- React 19.2.4 + React DOM 19.2.4 - UI layer
- NextAuth 5.0.0-beta.30 - Authentication; configured in `src/lib/auth.ts`
- Prisma 7.7.0 + `@prisma/client` 7.7.0 - ORM; schema at `prisma/schema.prisma`, config at `prisma.config.ts`

**Testing:**
- Not detected (no test runner, test scripts, or test files present)

**Build/Dev:**
- Next.js CLI - `next dev`, `next build`, `next start` (see `package.json` scripts)
- TypeScript compiler (via Next.js) - `tsconfig.json` targets ES2017, `moduleResolution: bundler`, path alias `@/* -> ./src/*`
- ESLint ^9 with `eslint-config-next` 16.2.3 - Flat config at `eslint.config.mjs` (uses `core-web-vitals` + `typescript` presets)

> NOTE per `AGENTS.md`: This is Next.js 16, which contains breaking changes vs. earlier versions. Consult `node_modules/next/dist/docs/` before writing Next.js code.

## Key Dependencies

**Critical:**
- `next` 16.2.3 - App framework
- `next-auth` ^5.0.0-beta.30 - Auth (beta release; credentials provider only)
- `@prisma/client` ^7.7.0 - DB access (Prisma 7)
- `@prisma/adapter-pg` ^7.7.0 - Prisma driver adapter bridging to node-postgres (`src/lib/db.ts`)
- `pg` ^8.20.0 - PostgreSQL client used by the Prisma adapter
- `bcryptjs` ^3.0.3 - Password hashing in `src/lib/auth.ts` and `src/app/api/auth/register/route.ts`

**UI / UX:**
- `@hello-pangea/dnd` ^18.0.1 - Drag-and-drop for kanban boards (`src/components/kanban/`)
- `framer-motion` ^12.38.0 - Animations
- `lucide-react` ^1.8.0 - Icon set used across pages/components

**Infrastructure:**
- `prisma` ^7.7.0 (dev use via `prisma.config.ts`, but declared in `dependencies`) - Schema, migrations, generate

**Types:**
- `@types/node` ^20, `@types/react` ^19, `@types/react-dom` ^19, `@types/bcryptjs` ^2.4.6, `@types/pg` ^8.20.0

## Configuration

**Environment variables (runtime):**
- `DATABASE_URL` - Postgres connection string; fallback `postgresql://coop:coop@localhost:5433/coop` (`src/lib/db.ts`, `prisma.config.ts`)
- `NEXTAUTH_SECRET` - NextAuth JWT secret (`src/lib/auth.ts`); also used as seed material for Matrix password derivation (`src/lib/matrix.ts`)
- `MATRIX_HOMESERVER_URL` - Synapse homeserver base URL; fallback `http://localhost:8008` (`src/lib/matrix.ts`, `src/app/api/chat/token/route.ts`)
- `MATRIX_ADMIN_TOKEN` - Bearer token for Synapse admin API calls (`src/lib/matrix.ts`)
- `NODE_ENV` - Standard; used to cache the Prisma client on `globalThis` in dev (`src/lib/db.ts`)

**Config files:**
- `next.config.ts` - Next.js config (currently empty options)
- `tsconfig.json` - TypeScript config with `@/*` alias to `./src/*`
- `eslint.config.mjs` - ESLint flat config
- `prisma.config.ts` - Prisma 7 config exporting `defineConfig({ schema, datasource })`
- `prisma/schema.prisma` - Data model (PostgreSQL)
- `docker-compose.yml` - Local Postgres (`:5433`) + Synapse (`:8008`) + Synapse's own Postgres
- `docker/synapse/homeserver.yaml`, `docker/synapse/coop.local.signing.key`, `docker/synapse/coop.local.log.config` - Synapse homeserver config

**Secrets handling:**
- No `.env*` files present at the project root at time of analysis
- `docker/synapse/coop.local.signing.key` is a Synapse signing key stored in-repo (local dev only)

## Platform Requirements

**Development:**
- Node.js capable of running Next.js 16 + React 19 (Node 18.18+ / 20+)
- Docker + Docker Compose for the Postgres and Synapse services declared in `docker-compose.yml`
- Local ports: `5433` (app Postgres), `8008` (Synapse)

**Production:**
- Deployment target not specified (no Vercel/Dockerfile/CI config detected beyond `docker-compose.yml`)
- Requires a reachable PostgreSQL database and (optionally) a Matrix/Synapse homeserver for chat features

---

*Stack analysis: 2026-04-14*
