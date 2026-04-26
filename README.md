# Darkflow Monorepo

Darkflow is a Turborepo monorepo with multiple Next.js apps and shared internal packages.

## Workspace Overview

### Apps

- `apps/df-client` - Darkflow trading/client interface (Next.js, React 19, assistant-ui, React Query)
- `apps/homebase` - marketing/homebase experience (Next.js)
- `apps/web` - general web app shell (Next.js)
- `apps/docs` - documentation app (Next.js)

### Packages

- `packages/ui` (`@darkflow/ui`) - shared UI primitives/components and design tokens (`darkflow-tokens.css`)
- `packages/eslint-config` (`@repo/eslint-config`) - shared ESLint presets
- `packages/typescript-config` (`@repo/typescript-config`) - shared TypeScript configuration

## Tech Stack

- [Turborepo](https://turborepo.com/)
- [Next.js](https://nextjs.org/) + [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- ESLint + Prettier

## Requirements

- Node.js `>=18`
- npm `10+` (repo uses `npm@10.9.0`)

## Getting Started

Install dependencies from repo root:

```sh
npm install
```

Start all workspace dev processes:

```sh
npm run dev
```

## Useful Commands

Run from repo root:

```sh
# Build all apps/packages
npm run build

# Lint all workspaces
npm run lint

# Type-check all workspaces
npm run check-types

# Format TS/TSX/MD files
npm run format
```

Run a command for one workspace with Turbo filters:

```sh
# Only run df-client dev
npx turbo run dev --filter=./apps/df-client

# Only run homebase dev
npx turbo run dev --filter=./apps/homebase

# Build docs only
npx turbo run build --filter=./apps/docs
```

## App Ports (default)

- `web`: `3000`
- `docs`: `3001`
- `homebase`: `3002`
- `df-client`: Next.js default unless overridden (typically `3000` when run alone)

## Repository Structure

```txt
darkflow/
  apps/
    df-client/
    docs/
    homebase/
    web/
  packages/
    eslint-config/
    typescript-config/
    ui/
  turbo.json
```

## Notes

- Task orchestration and caching are configured in `turbo.json`.
- Shared theme tokens used by Darkflow UI live in `packages/ui/darkflow-tokens.css`.
