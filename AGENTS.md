# Agent instructions — Climbing Coach

## Purpose

Local-first climbing coach app: import bouldering videos, auto-detect attempt start/fall,
propose auto-cuts, rate proximity + exertion, store a library, and later compare movement
(pose → alignment → insights). Product intent: `docs/PLAN.md`. How to build it:
`docs/BUILD_PLAN.md`. Desktop target is **macOS 13+ Apple Silicon only** in v1; iOS/Android
follow. Windows/Linux/Intel Mac are out of scope for v1.

Do not invent a greenfield product. Follow the plans; if ambiguous, pick the clearest path,
note the assumption in the PR, and keep building. Phase 0, Phase 1 engine, Phase 2-A
(backend, shell, homepage), and the Phase 3 comparison pipeline + skeleton compare view are
in tree. Ingest (P2-B), video playback, and comparison export wait on a dataset, ADR-001,
and macOS ffmpeg (ADR-002).

## Plans and decisions

| Doc                        | Role                                                  |
| -------------------------- | ----------------------------------------------------- |
| `docs/PLAN.md`             | Product requirements and function design              |
| `docs/BUILD_PLAN.md`       | Stack, modules, API, phases, tests, feedback loops    |
| `docs/adr/`                | Architecture decisions (template: `0000-template.md`) |
| `docs/capture-protocol.md` | Dataset capture defaults (P0.3)                       |
| `datasets/manifest.json`   | Dataset index only — media is private, not in git     |

Phase IDs (P0.1, P2-A.5, …) in commits/PRs should match `BUILD_PLAN` §5.

## Repo layout

```
apps/web          React + Vite renderer (browser dev; later Electron)
apps/server       Fastify local API (127.0.0.1)
apps/cli          `coach` CLI: eval, detect, align, compare, cut --draft, bench; video process waits on ffmpeg
apps/desktop      Electron `app://-` protocol + macOS menu (P2-A.4); packaging is P2-D
packages/schema   Types, Zod, posebin/signals/labels (no deps but Zod)
packages/engine   Pure algorithms — no I/O, no Node/DOM, no clocks/IDs
packages/api      DTOs, CoachApi, HTTP client, conformance suite
packages/core     Use cases, DB, jobs (no HTTP/Electron/React)
packages/config   Shared tsconfig / ESLint / Vitest presets
packages/test-fixtures  Synthetic climber and activity frames (no engine import)
research/pose-lab Python bake-off + posebin round-trip (not a pnpm package)
scripts/ffmpeg    LGPL macOS arm64 ffmpeg/ffprobe build + verify (P0.8 / ADR-002)
vendor/ffmpeg     CI prefix (`darwin-arm64/bin`); binaries are gitignored
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
pnpm build   # full compile; optional before `dev` — server/web `dev` rebuild deps via turbo
```

## Commands

| Task              | Command                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Build all         | `pnpm build`                                                                              |
| Lint              | `pnpm lint`                                                                               |
| Typecheck         | `pnpm typecheck`                                                                          |
| Unit tests        | `pnpm test`                                                                               |
| Module boundaries | `pnpm deps:check`                                                                         |
| Full local check  | `pnpm verify`                                                                             |
| Web UI            | `pnpm --filter @climbing-coach/web dev`                                                   |
| API server        | `pnpm --filter @climbing-coach/server dev` → `GET /api/v1/health` (dev token `dev-token`) |
| Schema only       | `pnpm --filter @climbing-coach/schema test`                                               |
| Python posebin    | `python3 -m pytest research/pose-lab/tests -q`                                            |

CI: `.github/workflows/ci.yml` (Linux lint/typecheck/test/deps + Python posebin; macOS arm64
schema smoke + LGPL ffmpeg build/verify). PR checklist: `.github/PULL_REQUEST_TEMPLATE.md`.

## Coding conventions

- **TypeScript strict** everywhere that ships. Zod for runtime validation; export JSON Schema
  from `schema` for Python.
- **Modularity:** every function should be modular — small and single-purpose, with clear
  inputs and outputs, composable, and independently testable. Prefer extracting helpers over
  growing large multi-responsibility functions.
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

**In tree now:** Phase 0 foundations, Phase 1 pure engine (P1.1–P1.6, P1.9–P1.10), P1.7 video
tools (probe, quick/full hash, frame source, H.264 proxy, lossless/reencode/auto cut,
thumbnail/filmstrip/loupe) behind a core `VideoTools` port, and the smallest recordings import
on `/recordings` (upload or absolute path, persisted row, probe metadata, proxy playback, cut).
Phase 2-A: SQLite library DB, core services, Fastify auth/SSE, web shell + homepage
training log, Electron `app://-` protocol helpers. `engine/stats` and `engine/grades` are
pure. Health stays `degraded` until the pose runtime ships; the P0.8 locator reports
bundled/env ffmpeg only (Linux PATH can run tools but `ffmpeg.available` stays false). Phase 3 (P3.1–P3.5):
`engine/compare` posture deltas + per-move text, `compare` job pipeline with a cached
`comparisons` table (migration 0002), `/comparisons` + `/videos/:id/pose` routes, and the web
`/compare` view (playback controller, skeleton/ghost renderer, divergence timeline, move panel,
alignment feedback labels).

**Blocked / not built yet:** real dataset media (P0.3, P1.11), pose bake-off / adapter
(P0.5–P0.6, P1.8), Apple signing (ADR-002 stays Proposed), the rest of ingest/review (P2-B:
activity, pose, proposals, filmstrip/loupe UI), library/player/rating (P2-C), Electron packaging
(P2-D), comparison video playback and export (P3.6), wall-relative ghost alignment, mobile.
Implement those only when the matching phase item says so and prerequisites exist.
