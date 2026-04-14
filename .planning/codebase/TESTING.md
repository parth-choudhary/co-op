# Testing Patterns

**Analysis Date:** 2026-04-14

## Test Framework

**Runner:** None. No test runner installed or configured.
- No `jest`, `vitest`, `mocha`, `ava`, `@playwright/test`, `cypress`, or `@testing-library/*` in `package.json`.
- No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*` anywhere in the repo.

**Assertion Library:** Not applicable — no test framework installed.

**Run Commands:** No test script exists. `package.json` scripts are:

```bash
npm run dev     # next dev
npm run build   # next build
npm start       # next start
npm run lint    # eslint
```

No `npm test` entry.

## Test File Organization

**Location:** No test files exist. Repo-wide scan for `*.test.*` and `*.spec.*` under `src/` (and elsewhere outside `node_modules`) returns zero matches.

**Naming:** No convention established.

**Structure:** Not applicable.

## Test Structure

Not applicable — no tests written yet.

## Mocking

**Framework:** Not applicable.

**What to Mock (forward-looking guidance):**
- Prisma singleton from `src/lib/db.ts` — easily swappable
- Matrix homeserver HTTP client in `src/lib/matrix.ts` (uses global `fetch`)
- `auth()` from `src/lib/auth.ts` when testing API handlers
- `bcryptjs` hashing in `src/lib/auth.ts`

## Fixtures and Factories

**Test Data:** None. Seed-style defaults only exist inline (e.g., default column set `To Do / In Progress / Review / Done` in `src/app/api/projects/route.ts` POST).

**Location:** No `fixtures/`, `__fixtures__/`, `__mocks__/`, or `test/` directory exists.

## Coverage

**Requirements:** None enforced.

**View Coverage:** Not applicable — no coverage tooling installed.

## Test Types

- **Unit Tests:** None.
- **Integration Tests:** None.
- **E2E Tests:** None.

**Manual QA Surface (current validation story):**
- TypeScript `strict: true` in `tsconfig.json`
- `eslint-config-next` rules via `npm run lint`
- Runtime exercising through `npm run dev` against the Dockerized Postgres (port 5433) and Synapse Matrix homeserver (see `docker/` and `docker-compose.yml`)

## Common Patterns

Not established. Any future tests should assert both HTTP status codes (401 / 400 / 403 / 404 / 201 / 200) and the `{ error: string }` body shape that handlers return.

## Recommendations for Introducing Tests

Greenfield — no prior pattern constrains the choice. Suggested directions aligned with the current stack:

- **Runner:** Vitest — pairs cleanly with Next.js 16 + React 19 and the existing ESM / `moduleResolution: "bundler"` setup in `tsconfig.json`.
- **Component tests:** `@testing-library/react` for client components (`src/components/kanban/CardDetailModal.tsx`, `src/components/layout/Sidebar.tsx`).
- **API route tests:** Import `GET`/`POST`/`PUT`/`DELETE` directly from `src/app/api/**/route.ts`, construct a `NextRequest`, assert on the returned `NextResponse`. Mock `auth()` and `prisma` per test.
- **E2E:** Playwright against the `docker-compose.yml` stack once flows stabilize.
- **Co-location:** match existing co-location convention (`Sidebar.tsx` + `Sidebar.module.css`) by placing `*.test.ts(x)` next to the module under test.

Forward-looking guidance only — nothing currently in place.

---

*Testing analysis: 2026-04-14*
