# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root (Turborepo orchestrates all workspaces):

```sh
npm install          # install all workspace dependencies
npm run dev          # start all apps in dev mode
npm run build        # build all apps/packages
npm run lint         # lint all workspaces
npm run check-types  # typecheck all workspaces
npm run format       # format TS/TSX/MD with Prettier
```

Run a single workspace:

```sh
npx turbo run dev --filter=./apps/client      # df-client trading UI (port 3000)
npx turbo run dev --filter=./apps/homebase    # marketing site (port 3001)
npx turbo run dev --filter=./apps/hq          # Darkflow Labs HQ (port 3002)
npx turbo run dev --filter=./apps/sync        # auth-gated price tick websocket fanout (port 8791)
```

Database (run from `packages/database`):

```sh
npm run db:generate   # regenerate Prisma client after schema changes
npm run db:migrate    # create and apply a new migration (dev)
npm run db:deploy     # apply existing migrations (CI/prod)
```

Onyx trading engine (run from `apps/onyx`):

```sh
npm run dev      # run with tsx hot-reload
npm run replay   # run replay engine against recorded data
```

Event-sync WebSocket server (uses Bun, run from `apps/event-sync`):

```sh
bun dev
```

Sync tick stream service (run from `apps/sync`):

```sh
npm run dev
```

## Architecture

This is an **npm workspaces + Turborepo** monorepo. Turbo task ordering: `db:generate` must complete before `dev` or `build` starts (see `turbo.json`). `DATABASE_URL` is a global env var consumed by Turbo.

### Packages (`packages/`)

| Package | Name | Purpose |
|---|---|---|
| `database` | `@darkflow/db` | Prisma client (PostgreSQL via `@prisma/adapter-pg`). Generated client lives in `generated/prisma/`. Schema at `prisma/schema.prisma`. Exposes singleton `prisma` instance with global guard for dev hot-reload. |
| `auth` | `@darkflow/auth` | `better-auth` server config (Discord OAuth). Exports `./server` (auth instance), `./client` (browser client). Depends on `@darkflow/db`. |
| `ui` | `@darkflow/ui` | Shared React 19 component library built on `@base-ui/react`, `class-variance-authority`, and `tailwind-merge`. Components are individually exported (e.g. `@darkflow/ui/button`). Design tokens in `darkflow-tokens.css`. |
| `eslint-config` | `@repo/eslint-config` | Shared ESLint presets |
| `typescript-config` | `@repo/typescript-config` | Shared `tsconfig` bases |

### Apps (`apps/`)

**`apps/client`** (`df-client`) — Main trading console (Next.js UI). Next.js 16 + React 19 + Tailwind CSS v4. Uses `@assistant-ui/react` + Vercel AI SDK for the chat copilot. State managed by Zustand + React Query. Key structure:
- `app/(app)/` — authenticated route group: home, coin detail, explore, portfolio, recon
- `app/(auth)/` — sign-in page
- `app/api/` — Route handlers for chat, chart, coin, explore, intel, portfolio, recon, trades, tokens, and Better Auth passthrough (`api/auth/[...all]`)
- `components/` — feature-scoped component directories (assistant-ui, chart, chat, coin, explore, feed, heatmap, intel, nav, portfolio, recon, signals, token, etc.)
- `lib/ai/` — AI prompt, Zod schema for `present_terminal` tool, mock language model and mock payload builder (used when `OPENAI_API_KEY` is absent)
- `lib/api/` — Axios client + React Query query functions
- `lib/data/` — Mock data files (portfolio, recon, coin insights)
- `transpilePackages` in `next.config.ts` includes `@darkflow/ui`, `@darkflow/auth`, `@darkflow/db`

The chat route (`app/api/chat/route.ts`) falls back to a mock streaming model when `OPENAI_API_KEY` is not set. The AI assistant always terminates by calling the `present_terminal` tool, which renders structured token cards in the UI.

**`apps/homebase`** — Marketing/waitlist site. Next.js 16 + React 19 + Tailwind v4. Simple page: `SiteHeader`, `TerminalHero`, `WaitlistCommand`, `BentoSection`, `SiteFooter`. No database or auth dependencies.

**`apps/hq`** (`@darkflow/hq`) — Darkflow Labs research landing. Next.js 16 + Tailwind v4; projects and toolkit sections with optional `NEXT_PUBLIC_*` URLs (see `apps/hq/.env.example`).

**`apps/onyx`** — Solana memecoin trading engine (Node.js/`tsx`, not Next.js). Modules:
- `ingest/` — DRPC WebSocket log subscriber, price streams (DRPC, pump.fun API, hybrid mux), source health tracking
- `risk/` — Risk engine, rug signal provider, on-chain rug checks, bonding curve math
- `execution/` — Jito MEV client, pump.fun API client, transaction builder, intent builder, exit executor
- `strategy/` — Position manager, exit engine, trading mode profiles
- `runtime/` — Risk controller, signer service, acceptance metrics
- `telemetry/` — Pino logger, metrics registry, alert bus
- `replay/` — Offline replay engine for strategy testing

**`apps/event-sync`** — Elysia WebSocket event server (runs on Bun, not Node). Uses Biome for linting/formatting instead of ESLint/Prettier.

### Auth flow

Better Auth is configured in `packages/auth` with Discord as the only social provider. The Next.js client proxies all auth requests through `app/api/auth/[...all]/route.ts`. The `BETTER_AUTH_URL` / `NEXT_PUBLIC_BETTER_AUTH_URL` env var controls the base URL (defaults to `http://localhost:3000`).

### Database

Single PostgreSQL database shared across apps. Prisma schema (`packages/database/prisma/schema.prisma`) defines `User`, `Session`, `Account`, `Verification` (Better Auth standard tables). The generated client is checked into `packages/database/generated/prisma/`. Apps that use the DB must `transpilePackages` it in `next.config.ts` and run `prisma generate` on install (see `postinstall` in `apps/client/package.json`).
