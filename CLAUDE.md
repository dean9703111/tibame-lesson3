# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vehicle Management System (VMS), a Traditional-Chinese internal app. npm workspaces monorepo, Node ≥ 20, ESM throughout.

- `apps/api` — Express 4 + Prisma 6 + Postgres 16. `@vms/api`.
- `apps/web` — Vite + React 18 + shadcn/ui + TanStack Query/Table + Zustand + React Router 7. `@vms/web`.
- `packages/shared` — `@vms/shared`. Zod schemas, shared types, `ApiError` taxonomy. Both ends import from here; do not duplicate schemas.
- `infra/pgadmin` — pgAdmin auto-provisioning (`servers.json` + `pgpass` mounted read-only).
- `openspec/` — change proposals, design, specs, and tasks. The archived `add-vehicle-management-system` change is the source of truth for current behavior. New work follows the OpenSpec workflow (`.cursor/skills/` and the `opsx:*` / `openspec-*` skills).

## One-time setup

```bash
cp .env.example .env
docker compose up -d        # postgres :5432, pgadmin :5050
npm install
npm run db:migrate          # prisma migrate dev (from apps/api)
npm run seed                # creates admin from SEED_ADMIN_USERNAME/PASSWORD
```

## Daily dev

```bash
docker compose up -d        # db must be running
npm run dev                 # concurrently runs api (tsx watch) + web (vite)
```

API listens on `API_PORT` (default 3000 via `.env`); Vite serves on `WEB_PORT` (defaults to **5174** in `vite.config.ts`, not 5173 — README is aspirational, the config is authoritative) and proxies `/api` to `API_TARGET` (default `http://localhost:3010`). **If you change `API_PORT`, also update `WEB_ORIGIN` (CORS) and `API_TARGET` (Vite proxy) or cookies will break.**

## Commands

```bash
npm run dev            # api + web together
npm run build          # workspace-aware build
npm run lint           # root ESLint + per-workspace lint (api/web currently no-op)
npm test               # root jest, then per-workspace tests
npm run test:root      # root-only jest (ignores apps/ and packages/)
npm run db:migrate     # apps/api: prisma migrate dev
npm run db:reset       # prisma migrate reset --force (Prisma still prompts)
npm run db:studio      # prisma studio on :5555
npm run seed           # re-create the admin
```

Single test runs (these call jest directly, **skipping** the `db:test:deploy` step that `npm run test:api` does first — make sure the `vms_test` schema already exists, e.g. run `npm run test:api` once or `npm run db:test:deploy --workspace apps/api`):
- API: `cd apps/api && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js src/routes/auth.test.ts`
- Web: `cd apps/web && npx vitest run src/pages/Login.test.tsx`

API tests run against a **dedicated test DB** (`vms_test`), not the dev DB (`vms`) — both live in the same `vms-db` Postgres container. The switch is automatic: jest sets `NODE_ENV=test`, so `loadDotenv.ts` layers `.env.test` (which overrides `DATABASE_URL` → `vms_test`) on top of `.env`. The `test` script runs `db:test:deploy` (`prisma migrate deploy` against `vms_test`) first, which auto-creates the DB on first run. `jest.config.js` forces `maxWorkers: 1` (all tests share the one `vms_test` instance); `src/test/setup.ts` exposes `resetDb()` which truncates `auditLog` + `vehicle` + `employee` in `beforeEach` so every test starts clean. Don't try to parallelize API tests. `.env.test` is gitignored — copy it from `.env.test.example`.

pgAdmin observability: `vms_test` is auto-created on **fresh** Postgres volume init by `infra/postgres/init/01-create-test-db.sql` (existing volumes won't re-run it — `npm run test:api` creates it instead). `infra/pgadmin/servers.json` ships **two** server entries — `VMS local` (→ `vms`) and `VMS test (vms_test)` (→ `vms_test`) — with `pgpass` covering both. servers.json is only imported into a **fresh** pgAdmin config volume; after editing it, re-provision with `docker compose rm -sf pgadmin && docker volume rm vms_pgadmin && docker compose up -d pgadmin` (Postgres data untouched).

## Auth + CSRF (subtle)

The API uses a JWT stored in an httpOnly `vms_token` cookie. The CSRF token is **HMAC-SHA256(JWT, COOKIE_SECRET)** (`apps/api/src/lib/csrf.ts`), returned in the `/api/auth/login` response body, kept in the Zustand `useAuthStore`, and re-attached to mutating requests as `X-CSRF-Token` by the Axios interceptor (`apps/web/src/lib/api.ts`). Consequences:

- `csrfGuard` (`apps/api/src/middleware/auth.ts`) skips non-mutating methods, skips `/api/auth/login`, and skips if there's no cookie (so anonymous mutating calls fall through to `requireAuth` which returns 401, not 403).
- `GET /api/auth/me` does **not** return a fresh CSRF token. On reload, `App.tsx` calls `/me` and re-uses the previously-stored `csrfToken`. If you ever clear cookies + localStorage you must log in again to get a token.
- `employeesMethodOverride` is registered **before** `csrfGuard` in `apps/api/src/app.ts` so `DELETE /api/employees/:id` returns `405 METHOD_NOT_ALLOWED` (employees aren't deletable — use `status=INACTIVE`). Don't reorder this without updating the spec.

## Errors

All errors flow through `apps/api/src/middleware/error.ts`:
- `HttpError(status, code, message, details?)` → JSON `{ error: { code, message, details } }` with that status.
- `ZodError` → 400 `VALIDATION_ERROR` with `err.flatten()` in `details`.
- Everything else → 500 `INTERNAL_ERROR` (and `console.error` for the server log).

The full code taxonomy lives in `packages/shared/src/errors.ts`. **Add new codes there**, not inline, so both ends stay in sync. The web `apiClient` interceptor unwraps server errors into a typed `ApiError` (`apps/web/src/lib/api.ts`).

## Authorization

`requireAuth` then optionally `requireAdmin`. Two role-sensitive specifics:

- `GET /api/vehicles` and `GET /api/vehicles/:id` auto-scope to `ownerId = req.user.employeeId` when `role === 'USER'`. A USER asking for someone else's vehicle gets 404, not 403 (intentional, to not leak existence).
- `PATCH /api/employees/:id` blocks demoting yourself (`CANNOT_DEMOTE_SELF`).

## Conventions

- `@vms/shared` re-exports everything via `packages/shared/src/index.ts`. New schemas go in `src/schemas/<domain>.ts` and must be re-exported from `index.ts`. The API jest config has a moduleNameMapper that points `@vms/shared` at the source (not `dist`), so you do **not** need to build the package before running API tests.
- ESM only. Import paths use `.js` suffixes inside the API (NodeNext ESM resolution); the jest mapper rewrites `.js` back to `.ts` for tests.
- The root `eslint.config.js` **ignores `apps/**` and `packages/**`**; per-workspace `lint` scripts are currently `echo 'no lint'`. Treat lint as covering root config/scripts only — don't lean on it for type/style checks inside apps.
- Husky `pre-commit` runs `npm run lint` + `npm test` in parallel and fails on either. Both must pass; don't `--no-verify` without a reason.
- Conventional commits in Traditional Chinese (see `git log`): `feat(api):`, `docs(openspec):`, etc.

## Spec workflow

This repo uses OpenSpec. The richest existing artifacts are under `openspec/changes/archive/add-vehicle-management-system/` (proposal, design, tasks, deltas) and the synced specs under `openspec/specs/{auth,dashboard,employees,vehicles}/`. Use the `openspec-*` / `opsx:*` skills (already installed) to propose, apply, verify, and archive changes — don't hand-edit specs without going through a change unless you're fixing typos.
