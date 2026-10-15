# Agent instructions — Climbing Coach

## Purpose

Local-first climbing coach app: import bouldering videos, auto-detect attempt start/fall,
propose auto-cuts, rate proximity + exertion, store a library, and later compare movement
(pose → alignment → insights). Product intent: `docs/PLAN.md`. How to build it:
`docs/BUILD_PLAN.md`. Desktop target is **macOS 13+ Apple Silicon only** in v1; iOS/Android
follow. Windows/Linux/Intel Mac are out of scope for v1.

Do not invent a greenfield product. Follow the plans; if ambiguous, pick the clearest path,
note the assumption in the PR, and keep building. Highest-leverage next work is Phase 0
(`BUILD_PLAN` §5.2), then Track A (engine) and Track B (app) in parallel where the plan allows.

## Plans and decisions

| Doc | Role |
| --- | --- |
| `docs/PLAN.md` | Product requirements and function design |
| `docs/BUILD_PLAN.md` | Stack, modules, API, phases, tests, feedback loops |
| `docs/adr/` | Architecture decisions (template: `0000-template.md`) |
| `docs/capture-protocol.md` | Dataset capture defaults (P0.3) |
| `datasets/manifest.json` | Dataset index only — media is private, not in git |

Phase IDs (P0.1, P2-A.5, …) in commits/PRs should match `BUILD_PLAN` §5.

## Repo layout

```
apps/web          React + Vite renderer (browser dev; later Electron)
apps/server       Fastify local API (127.0.0.1)
apps/cli          `coach` CLI (eval/process arrive in P1)
apps/desktop      Electron packaging placeholder (P2)
packages/schema   Types, Zod, posebin/signals/labels (no deps but Zod)
packages/engine   Pure algorithms — no I/O, no Node/DOM, no clocks/IDs
packages/api      DTOs, CoachApi contract
packages/core     Use cases, DB, jobs (no HTTP/Electron/React)
packages/config   Shared tsconfig / ESLint / Vitest presets
research/pose-lab Python bake-off + posebin round-trip (not a pnpm package)
```

Dependency direction (enforced by `pnpm deps:check`):  
`schema` ← `engine`/`api` ← `core` ← apps/adapters. Never import adapters from `core`/`engine`.

## Setup

- Node **22+**, **pnpm** (see `packageManager` in root `package.json`).
- `node-linker=hoisted` is required (`.npmrc`).
- Full desktop packaging needs a Mac + Xcode tools; Linux is fine for `schema` / `engine` /
  `api` / web browser-dev and CI unit tests.

```bash
pnpm install
pnpm build
```

## Commands

| Task | Command |
| --- | --- |
| Build all | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit tests | `pnpm test` |
| Module boundaries | `pnpm deps:check` |
| Full local check | `pnpm verify` |
| Web UI | `pnpm --filter @climbing-coach/web dev` |
| API server | `pnpm --filter @climbing-coach/server dev` → `GET /api/v1/health` |
| Schema only | `pnpm --filter @climbing-coach/schema test` |
| Python posebin | `python3 -m pytest research/pose-lab/tests -q` |

CI: `.github/workflows/ci.yml` (Linux lint/typecheck/test/deps + Python posebin; macOS arm64
schema smoke). PR checklist: `.github/PULL_REQUEST_TEMPLATE.md`.

## Coding conventions

- **TypeScript strict** everywhere that ships. Zod for runtime validation; export JSON Schema
  from `schema` for Python.
- **Time:** media timestamps are integer microseconds (`Us`). IDs are ULIDs (generated in
  `core`, validated in `schema`).
- **`engine`:** pure functions over typed arrays only. Ban `fs`/`path`/`process`/`window`/
  `document`/`Date.now`/`Math.random` as the package grows.
- **`schema`:** may depend on Zod only (plus schema helpers like `zod-to-json-schema`).
- Prefer workspace packages (`@climbing-coach/*`) over relative imports across package roots.
- User-visible UI strings will use **Lingui** (`lingui.config.ts`); English at launch. Do not
  spray new product copy without i18n once real screens land (P2-A).
- Format with Prettier; do not commit `datasets/media` or secrets.
- Pose model / ffmpeg licensing decisions go through ADR-001 / ADR-002 — do not ship AGPL YOLO
  or a GPL ffmpeg in the app without an accepted ADR.

## What exists today vs later

**In tree now:** monorepo scaffolding (P0.1), schema v0.1 with posebin/signals/labels + tests
(P0.2 started), stub `engine`/`api`/`core`, minimal web shell + Fastify `/health`, CLI
`version`, CI, ADR/PR templates.

**Not built yet:** real ingest/review UI, Electron packaging, pose runtime, ffmpeg pipeline,
comparison, mobile. Implement those only when the matching phase item says so.
