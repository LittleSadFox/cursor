# Climbing Coach

Local-first app for recording bouldering attempts, auto-cutting clips, rating proximity and
exertion, and comparing movement over time. Product plan: [`docs/PLAN.md`](docs/PLAN.md).
Engineering plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

**Desktop target:** macOS 13+ on Apple Silicon. Mobile (iOS, then Android) follows.

## Current status

Phase 0 foundations:

- **P0.1** Monorepo scaffolding (pnpm hoisted + Turborepo, shared config, CI, ADR/PR templates)
- **P0.2 (started)** `@climbing-coach/schema` — `Us`, ULID, posebin / signals / label contracts

## Develop

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @climbing-coach/web dev   # Vite UI shell
pnpm --filter @climbing-coach/server dev # local Fastify /health
```

Useful scripts: `pnpm lint`, `pnpm typecheck`, `pnpm deps:check`, `pnpm verify`.

## Layout

See BUILD_PLAN §2.1. In short: `packages/schema|engine|api|core`, `apps/web|server|cli|desktop`,
`research/pose-lab`, `datasets/` (manifest only).
