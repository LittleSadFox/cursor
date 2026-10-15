# Climbing Coach

Local-first app for recording bouldering attempts, auto-cutting clips, rating proximity and
exertion, and comparing movement over time. Product plan: [`docs/PLAN.md`](docs/PLAN.md).
Engineering plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

**Desktop target:** macOS 13+ on Apple Silicon. Mobile (iOS, then Android) follows.

## Current status

Phase 0 foundations (see `docs/BUILD_PLAN.md` §5.2):

- **P0.1** Monorepo scaffolding
- **P0.2** Schema v1.0.0 (`Us`, ULID, posebin, signals, labels, feature spec, dataset manifest)
- **P0.3** Capture protocol + consent template (media collection still external)
- **P0.4** Minimal `research/label-tool`
- **P0.7 (started)** `coach eval` on synthetic fixtures (Wilson + bootstrap CIs)
- **ADR-001 / ADR-002** Proposed (await bake-off / macOS ffmpeg proof)

## Develop

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm build
pnpm verify
pnpm --filter @climbing-coach/web dev
pnpm --filter @climbing-coach/server dev
pnpm --filter @climbing-coach/cli exec node dist/main.js eval \
  --fixture datasets/fixtures/eval/baseline-synthetic.json
```

Useful scripts: `pnpm lint`, `pnpm typecheck`, `pnpm deps:check`, `pnpm verify`.

## Layout

See BUILD_PLAN §2.1. In short: `packages/schema|engine|api|core`, `apps/web|server|cli|desktop`,
`research/pose-lab`, `datasets/` (manifest only).
