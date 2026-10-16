# Climbing Coach

Local-first app for recording bouldering attempts, auto-cutting clips, rating proximity and
exertion, and comparing movement over time. Product plan: [`docs/PLAN.md`](docs/PLAN.md).
Engineering plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

**Desktop target:** macOS 13+ on Apple Silicon. Mobile (iOS, then Android) follows.

## Current status

Phase 0–1 are on `main`. This branch adds Phase 2-A (training log homepage, no video ingest):

- **P2-A.1** SQLite schema (Drizzle), migrations, repositories, backup port
- **P2-A.2** Core services + DAG job runner; `engine/stats` and `engine/grades`
- **P2-A.3** Fastify API with auth, Host/Origin checks, problem+json, SSE, signed media URLs
- **P2-A.4** Web shell (router, Lingui, settings, trash, first-run) and Electron `app://-` helpers
- **P2-A.5** Homepage: today's log (prefill + override) and load / ACWR / volume / focus / pyramid charts

Still blocked: P2-B ingest/review (ffmpeg, ADR-001, dataset), P2-C library/player, P2-D packaging.

## Develop

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm build
pnpm verify
COACH_TOKEN=dev-token pnpm --filter @climbing-coach/server dev
VITE_COACH_TOKEN=dev-token pnpm --filter @climbing-coach/web dev
pnpm --filter @climbing-coach/cli exec node dist/main.js eval \
  --fixture datasets/fixtures/eval/baseline-synthetic.json
```

Useful scripts: `pnpm lint`, `pnpm typecheck`, `pnpm deps:check`, `pnpm verify`.

## Layout

See BUILD_PLAN §2.1. In short: `packages/schema|engine|api|core`, `apps/web|server|cli|desktop`,
`research/pose-lab`, `datasets/` (manifest only).
