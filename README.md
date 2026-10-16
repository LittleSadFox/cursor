# Climbing Coach

Local-first app for recording bouldering attempts, auto-cutting clips, rating proximity and
exertion, and comparing movement over time. Product plan: [`docs/PLAN.md`](docs/PLAN.md).
Engineering plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

**Desktop target:** macOS 13+ on Apple Silicon. Mobile (iOS, then Android) follows.

## Current status

Phase 0 foundations are on `main`. Phase 1 pure engine (no video decode yet):

- **P0.1–P0.4, P0.7** Scaffold, schema v1.0.0, capture protocol, label tool, synthetic `coach eval`
- **P1.1–P1.6** Activity, pose preprocess, features, detection, review draft, moves, alignment
- **P1.9** Synthetic climber fixtures (pose JSON, not fixture videos)
- **P1.10** `coach detect`, `align`, `cut --draft`, `bench`. `process` waits on ffmpeg
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
