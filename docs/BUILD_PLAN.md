# Climbing Coach App — Code Building Plan

This document turns the product plan in [`PLAN.md`](./PLAN.md) into an engineering plan: the
technical stack, code modules, architecture, API, development phases, test criteria, and
feedback loops. `PLAN.md` says *what* the app does and *why*; this document says *how it is
built* and *how we know each part works*. Section references like "PLAN 2.4" point to the
product plan. Revision 2 applies the plan review; Revision 3 makes macOS the only desktop
platform. See the [changelog](#9-changelog).

Desktop target: macOS 13 Ventura or later on Apple Silicon (arm64). Windows, Linux, and Intel
Macs are not supported in v1 (see 5.8 for what adding them would take). Mobile follows: iOS,
then Android.

Contents

1. [Technical stack](#1-technical-stack)
2. [Repository and code modules](#2-repository-and-code-modules)
3. [System architecture](#3-system-architecture)
4. [API details](#4-api-details)
5. [Development phases](#5-development-phases)
6. [Test criteria](#6-test-criteria)
7. [Feedback loops](#7-feedback-loops)
8. [Open decisions and build risks](#8-open-decisions-and-build-risks)
9. [Changelog](#9-changelog)

---

## 1. Technical stack

### 1.1 Choices

| Area | Choice | Why | Alternative kept open |
| --- | --- | --- | --- |
| Language (app) | TypeScript (strict) for everything that ships | One language for engine, services, desktop UI, and mobile UI | — |
| Language (research) | Python 3.11+ in `research/` only | Pose bake-off, keypoint accuracy (PCK), optional GBDT experiments | — |
| Monorepo | pnpm workspaces (`node-linker=hoisted`, required by Expo/Metro) + Turborepo | Fast installs, task caching | Nx |
| Runtime validation | Zod; JSON Schema exported for the Python research code | Same schema validates API, files, and forms | — |
| Local backend | Node.js (current LTS) + Fastify | Runs the TS engine natively; HTTP range requests for video | — |
| Database | SQLite via Drizzle ORM (better-sqlite3 on desktop, expo-sqlite on mobile) | One schema and one set of migrations for both platforms | op-sqlite on mobile if expo-sqlite is too slow |
| Jobs | In-process job queue persisted in SQLite, DAG pipelines | Survives restarts, no extra service, independent steps run in parallel | — |
| Video tools | ffmpeg / ffprobe, one own LGPL build for macOS arm64 with VideoToolbox decode and encode (ADR-002) | Probe, frame decoding, proxies, lossless cut, thumbnails, export; VideoToolbox gives hardware H.264/HEVC without GPL encoders | GPL build run as a separate process (needs legal sign-off); AVFoundation through a native addon |
| Pose runtime (shipped) | Chosen in ADR-001. Preferred: ONNX Runtime with RTMDet + RTMPose — `onnxruntime-node` with the CoreML execution provider on macOS, ONNX Runtime Mobile with CoreML on iOS and NNAPI/XNNPACK on Android; CPU provider in Linux CI. Alternative: MediaPipe Tasks Vision in a hidden Electron window, MediaPipe Tasks on mobile | Same model file on every platform; macOS and iOS share the CoreML acceleration path, which makes desktop ⇄ iPhone parity easier; runs in the CLI and CI; no Python in the shipped app | Python sidecar only as a last resort |
| ML training | Logistic regression trained in TS (`engine/models`), runs on desktop and mobile | Small data, trivial explanations, trivial cross-platform parity | GBDT trained in `research/` and imported only if it measurably wins |
| Desktop shell | Electron (renderer + utility process) for macOS arm64, renderer served from a custom `app://` protocol | Runs the Node backend in the same runtime as the engine; Chromium on macOS decodes HEVC and HDR in hardware and supports `requestVideoFrameCallback`; stable origin for CSP and auth; keeps Windows/Linux possible later | Tauri (WKWebView is fine on macOS, but the Node backend would become a separate sidecar); native SwiftUI (would rewrite the web UI and lose browser dev mode) |
| Packaging / signing | electron-builder: DMG for download plus zip for updates (electron-updater / Squirrel.Mac); Developer ID signing with hardened runtime, notarization, and stapling; every nested executable (ffmpeg, ffprobe, `.node` addons) signed | Gatekeeper blocks unsigned or unnotarized apps | Mac App Store later (needs App Sandbox, security-scoped bookmarks for the library folder, and sandboxed ffmpeg) |
| macOS integration | Photos import through PHPicker in a small native addon (`apps/desktop/native/photos`); `powerSaveBlocker` during ingest; Time Machine exclusion for rebuildable caches | iPhone videos usually reach the Mac through iCloud Photos, not Finder | Drag-and-drop from Finder, or "Export Unmodified Original" from Photos |
| Web UI | React, Vite, TanStack Router, TanStack Query, Zustand (+ immer patches for undo), React Hook Form | Server state, UI state, and forms each get one tool | — |
| Web styling | Tailwind CSS + Radix UI primitives | Accessible primitives, shared design tokens | — |
| i18n | Lingui message catalogs from day one (English at launch) | Retrofitting strings later touches every component | i18next |
| Web charts | Recharts | Covers bar, line, scatter, stacked bar | visx for custom charts |
| Overlay rendering | Canvas 2D (web), react-native-skia (mobile), `@napi-rs/canvas` (export) | All three consume the same draw commands from `render` | — |
| Mobile | Expo (dev client / prebuild), React Native, react-native-vision-camera, expo-file-system, expo-sensors, expo-media-library / Photos picker, Expo Modules (Swift/Kotlin) | Shared hooks and core services; native modules for frame decoding, pose, and cutting | Flutter (would mean rewriting the engine in Dart) |
| Mobile charts | victory-native (Skia) | Same series data as the web charts | — |
| Mobile cutting | AVFoundation (iOS), Media3 Transformer (Android) | Native lossless trim | — |
| Unit / integration tests | Vitest, fast-check (property tests), Testing Library | — | — |
| E2E tests | Playwright (web + Electron), Maestro (mobile) | — | Detox |
| Lint / format | ESLint (typescript-eslint, Lingui plugin), Prettier, dependency-cruiser for module boundaries; ruff in `research/` | — | Biome |
| Development machine | A Mac on Apple Silicon with Xcode command-line tools for packaging, native addons, and video integration tests; `engine`, `schema`, `api`, and the web UI in browser dev mode also work on Linux | — | — |
| CI | GitHub Actions: Linux runners for lint, typecheck, unit, and engine tests; macOS arm64 runners for ffmpeg integration, Electron E2E, packaging, and notarization; visual snapshots in a pinned Linux container | Pure-TS work runs on cheaper runners; anything touching the shipped binaries runs on the target OS; font rendering is stable in the container | Self-hosted Apple Silicon Mac for hardware-encoder and CoreML benchmarks |
| Versioning | Changesets, semver for `engine` and model artifacts | Derived data records the version that produced it | — |
| Logging | pino (JSON, rotated files in the library folder) | Local diagnostics without telemetry | Sentry, opt-in only |

### 1.2 Licensing constraints

- MediaPipe (Apache-2.0), RTMPose / RTMDet / MMPose (Apache-2.0), and ONNX Runtime (MIT) are
  safe to ship.
- ffmpeg (ADR-002, Phase 0): the common prebuilt static binaries are GPL builds with libx264.
  Default plan: build one LGPL ffmpeg/ffprobe for macOS arm64 in CI with VideoToolbox
  (`h264_videotoolbox`, `hevc_videotoolbox`, hardware decode). VideoToolbox also covers the
  no-hardware case (`-allow_sw 1` uses Apple's software encoder, for example on CI virtual
  machines), so no third-party H.264 encoder ships. The binaries are signed with the hardened
  runtime inside the app bundle. The alternative, shipping a GPL ffmpeg as a separate
  executable with a source offer, needs a legal decision recorded in the ADR.
- Ultralytics YOLO is AGPL-3.0: allowed in `research/` for the bake-off, never in shipped
  artifacts.

---

## 2. Repository and code modules

### 2.1 Layout

Until mobile work starts, code that only one app uses lives as a folder inside that app or
package, with boundaries enforced by dependency-cruiser. In P5.1 the shared folders are
extracted into packages once a second consumer exists.

```
climbing-coach/
  apps/
    desktop/            Electron main + preload, app:// protocol, packaging, signing,
                        notarization (macOS arm64)
      native/photos/    Node addon (Objective-C++ / Swift): PHPicker import from Photos
    web/                React renderer (Vite); runs inside Electron or in a browser in dev mode
      src/render/       Overlay draw commands (→ packages/render in P5.1)
      src/hooks/        Query hooks, view models, player clock, comparison controller
                        (→ packages/app-hooks in P5.1)
      src/ui/           Web design system, timeline primitives, chart wrappers (stays web-only)
    server/             Fastify local API server (runs in the Electron utility process)
    cli/                `coach` CLI: process, cut, align, eval, bench
    mobile/             Expo app (Phase 5)
      modules/frames/   Expo module: AVAssetReader / MediaCodec frame decoding
      modules/pose/     Expo module: pose runtime chosen in ADR-001
      modules/cutter/   Expo module: AVFoundation / Media3 Transformer
  packages/
    schema/             Domain types, time units, IDs, posebin + signals formats, label formats,
                        feature spec
    engine/             Pure algorithms (no I/O): activity, pose, detect, cut, moves, align,
                        compare, stats, grades, features, insights, models
    api/                Resource DTOs, request/response schemas, route table, `CoachApi`
                        interface, HTTP client, problem codes, API conformance test suite
    core/               Application services implementing `CoachApi`, ports, job pipelines,
                        label derivation
      src/db/           Drizzle schema (driver-agnostic), migrations, repositories
    adapters-node/      better-sqlite3 driver, fs file store, ffmpeg video tools and frame
                        source, pose runtime adapter, worker_threads compute pool, signed URLs
    adapters-native/    expo-sqlite driver, file store, native module bindings (Phase 5)
    test-fixtures/      Synthetic climber generator, fixture-video generator, fake ports,
                        golden files
    config/             Shared tsconfig, ESLint, Prettier, Vitest presets
  research/
    pose-lab/           Python: bake-off backends (MediaPipe, RTMPose, YOLO), PCK scoring,
                        posebin writer, ONNX export of the chosen model
    label-tool/         Minimal temporal labeling page (Phase 0)
    training/           Optional GBDT experiments (Phase 4)
    notebooks/
  datasets/             manifest.json + label JSONL (media lives in private storage, not git)
  docs/
    PLAN.md  BUILD_PLAN.md  adr/  capture-protocol.md
```

### 2.2 Module responsibilities

| Module | Owns | Must not |
| --- | --- | --- |
| `schema` | Types and Zod schemas for time (`Us`), IDs (ULID), `PoseTrack`, posebin and signals readers/writers, label records, feature spec | Depend on anything but Zod |
| `engine` | Every algorithm in PLAN 2.1–2.9 and 2.11 as pure functions over typed arrays, including review-draft operations and label derivation | Do I/O, use Node or DOM globals, read clocks, or generate IDs |
| `api` | The public contract: DTOs, routes, `CoachApi`, HTTP client, error codes, conformance suite | Contain business logic |
| `core` | Use cases, transactions, job pipelines, detector-update merging, DB schema and repositories | Know about HTTP, Electron, React, or a specific database driver |
| `adapters-node` | Desktop implementations of ports (DB driver, files, ffmpeg, frame source, pose runtime, compute pool) | Be imported by `core` or `engine` |
| `adapters-native` | Mobile implementations of ports | Be imported by `core` or `engine` |
| `apps/server` | Route registration, auth, media serving, SSE, wiring ports → `core` | Contain business logic |
| `apps/web` `src/render` | Pose → draw commands for any painter | Touch a canvas or the DOM |
| `apps/web` `src/hooks` | Query hooks, optimistic updates, event invalidation, player clock, comparison controller | Import `react-dom` or `src/ui` |
| `apps/web` `src/ui`, pages | Web components, styling, pages | Call `fetch` directly (always via `src/hooks`) |
| `research/*` | Experiments and evaluation inputs | Be imported by anything that ships; compute ML features (features always come from `engine/features`) |

### 2.3 Dependency rules (enforced by dependency-cruiser in CI)

| Module | May depend on |
| --- | --- |
| `schema` | — |
| `engine` | `schema` |
| `api` | `schema` |
| `core` | `schema`, `engine`, `api` |
| `adapters-node`, `adapters-native` | `schema`, `core` (ports, DB schema) |
| `apps/server`, `apps/cli` | `core`, `adapters-node`, `api`, `engine` |
| `apps/web` `src/render` | `schema`, `engine` (types only) |
| `apps/web` `src/hooks` | `schema`, `api`, `src/render` |
| `apps/web` pages, `src/ui` | `src/hooks`, `src/render`, `api` (types and HTTP client) |
| `apps/desktop` | Nothing at runtime except starting `apps/server`, serving `apps/web`, and its own `native/photos` addon; imports from Photos go through the same HTTP API (`api` client) |
| `apps/mobile` | `core`, `adapters-native`, `app-hooks`, `render`, `api` |

`engine` is checked by a lint rule that bans `fs`, `path`, `process`, `window`, `document`,
`Date.now`, and `Math.random`; its tests run under both Node and a browser-like environment.

### 2.4 `engine` submodules

| Submodule | Key exports | PLAN ref |
| --- | --- | --- |
| `activity` | `activityEnergy`, `globalMotion` (phase correlation), `activeWindows`, `cameraMovingWarning` | 2.1, 2.4 |
| `pose` | `preprocess`, `selectClimberTrack`, `oneEuroFilter`, `fillGaps`, `normalize`, `bodyMetrics` | 2.1 |
| `features` | `frameFeatures`, `attemptFeatures`, `moveFeatures`, `FEATURE_SPEC` (versioned names and order) | 2.1, 2.9 |
| `detect` | `estimateFloor` (with fallbacks), `detectStarts`, `detectEnds`, `exitDirection`, `classifyOutcome`, `detectAttempts`, `detectorSignals`, `applyBoundaryOffset` | 2.2, 2.3 |
| `cut` | `proposeItems`, `clipRangeOf`, `splitItem`, `mergeItems`, `validateDraft` (overlap on climb ranges), `mergeDetectorUpdate`, `deriveLabels` | 2.4 |
| `moves` | `segmentMoves`, `stationaryPeriods`, `fallMoveIndex` | 2.5 |
| `align` | `matchMoves` (Needleman–Wunsch), `collapseRests`, `bandedDtw`, `openEndDtw`, `reduceFeatures` (PCA), `align` | 2.7 |
| `compare` | `jointAngleDeltas`, `comSupportOffset`, `divergenceSeries`, `summarizeByMove` | 2.8 |
| `stats` | `trainingLoad`, `rollingAverages`, `ewmaLoad`, `acwr`, `exertionVolume`, `focusDistribution`, `gradePyramid`, `weeklySummary`, `prefillTrainingLog` | 2.11 |
| `grades` | Grade systems (V, Font, YDS, French), `toDifficultyIndex`, `formatGrade` | 2.10, 2.11 |
| `insights` | Rule engine (`evaluateRules`), rule definitions with evidence and minimum-N guards | 2.9 Stage A |
| `models` | `trainLogistic` (L2, Newton/IRLS, deterministic), `predict`, `linearContributions`; GBDT runtime and TreeSHAP only if GBDT is adopted | 2.9 Stage B |

Starting parameters (tuned on the dev split in Phase 1, stored in a versioned `params.ts`):

| Parameter | Start value |
| --- | --- |
| Activity pass | keyframes only (or 2 fps when the GOP is > 2 s), 160 px grayscale |
| Active window | activity above threshold, gaps < 5 s merged, padded ± 3 s; if > 80% of the recording is active, process all of it |
| Pose sample rate | 15 fps on active windows for detection; 30 fps on committed clips (`pose-hq`) |
| Ankle lift for "on wall" | > 0.15 × body height above floor |
| Hip stillness to confirm start | vertical speed < 0.3 body heights/s for ≥ 0.5 s |
| Fall threshold | downward hip speed > 1.5 body heights/s |
| Top dwell | both wrists stationary at max height ≥ 0.7 s, or exit through the top of the frame |
| Stationary limb | speed < 0.15 torso lengths/s for ≥ 0.25 s |
| Rest collapse | speed < 0.1 torso lengths/s for > 1 s → keep 3 representative frames |
| Walk-out gap merge | out of frame < 3 s → same attempt |
| DTW band | 20% of the longer matched segment; fallback DTW on 16 PCA components |
| Per-user boundary offset | bounded ± 1 s; needs ≥ 20 labels with ≥ 70% the same sign |
| Default padding | pre-roll 2 s, post-roll 1.5 s (user setting) |

---

## 3. System architecture

### 3.1 Runtime overview

Desktop:

```
┌───────────────────────────── Electron app ─────────────────────────────┐
│ Main process: windows, menus, file dialogs, opt-in auto-update          │
│   serves the renderer from app://-, starts the utility process,         │
│   passes {port, token} to the preload                                   │
│                                                                        │
│ Renderer (apps/web, app://-)        Utility process (apps/server)       │
│  React UI ── fetch + fetch-SSE ──►  Fastify  /api/v1  (127.0.0.1 only)  │
│  <video> ── signed media URLs ───►  core services                      │
│                                      job runner (DAG) ─┬─ worker_threads: engine
│                                                        ├─ pose runtime (ADR-001)
│                                                        └─ ffmpeg / ffprobe
│                                      SQLite library.db · file store     │
└────────────────────────────────────────────────────────────────────────┘
```

If ADR-001 picks MediaPipe Tasks, the pose runtime is a hidden Electron window with WebGL;
decoded frames reach it over a `MessagePort`. With ONNX Runtime it runs in a worker thread
with the CoreML execution provider (Neural Engine / GPU), falling back to the CPU provider if
a model operator is not supported. Either way the model is loaded lazily on the first ingest,
not at app start; CoreML's compiled-model cache lives in the app's caches folder, so only the
first run after an install or model update pays the compile cost.

macOS specifics in the main process:

- While any job is running, `powerSaveBlocker.start('prevent-app-suspension')` keeps App Nap
  and idle sleep from stalling ingest; it is released when the queue drains. Closing the
  window keeps the app running in the Dock until jobs finish (standard macOS behavior); Quit
  asks before cancelling running jobs.
- The Photos import addon runs PHPicker with video-only filtering, requests the original file
  (downloading from iCloud with progress if needed), writes it to `<libraryRoot>/originals/`,
  and calls `POST /recordings` with `importMode: move` and the asset's creation date.
- Dock badge with the number of recordings waiting for review; a notification when a long
  ingest finishes while the app is in the background.

Mobile:

```
┌──────────────────────────── Expo app (Hermes) ──────────────────────────┐
│ React Native UI (apps/mobile) → app-hooks → CoachApi (in-process)       │
│   → core services → engine (JS, run off the UI thread)                  │
│   → adapters-native: expo-sqlite + Drizzle, file store,                 │
│       FramesModule (AVAssetReader / MediaCodec),                        │
│       PoseModule (runtime from ADR-001, background thread),             │
│       CutterModule (AVFoundation / Media3 Transformer)                  │
│   → job runner (JS, persisted in SQLite; heavy work in native threads)  │
└────────────────────────────────────────────────────────────────────────┘
```

Why the desktop renderer talks HTTP to a local server instead of Electron IPC:

- `<video>` gets HTTP range requests for free.
- The web UI runs in a normal browser during development with hot reload.
- Playwright, the CLI, and the conformance suite all hit the same API.
- `core` exposes one `CoachApi`; desktop wraps it in HTTP, mobile calls it in-process. Both are
  verified by the same conformance suite (6.2).

### 3.2 Backend architecture (desktop local server)

#### Layers

```
HTTP routes (apps/server)     auth · validation (Zod) · problem+json · media · SSE
        │
Application services (core)   use cases, transactions, job enqueueing, label derivation
        │
Domain (engine)               pure algorithms
        │
Ports (core/ports)            Repositories · FileStore · FrameSource · PoseExtractor ·
        │                     VideoTools · ComputePool · JobQueue · Clock · IdGen · Logger
Adapters                      adapters-node (desktop) / adapters-native (mobile)
```

#### Application services (`core`)

| Service | Responsibilities |
| --- | --- |
| `IngestService` | Import a recording (copy / move / reference) after the file size is stable, dedupe by quick hash, enqueue the ingest pipeline |
| `ReviewService` | Load and save the review draft, merge detector updates without touching user-edited items, select the climber track, commit; derive labels at commit |
| `AttemptService` | Query attempts, update ratings / outcome / fall move / climb range / tags / notes, re-cut, export |
| `BoulderService`, `GymService`, `SessionService` | CRUD (including quick-create from the review screen), boulder stats and progress series |
| `ComparisonService` | Create or reuse a comparison, enforce matching pose model, serve results, record alignment feedback |
| `TrainingLogService` | Upsert / delete daily entries, compute prefill from that day's sessions |
| `StatsService` | Training load (rolling or EWMA), ACWR, exertion vs. volume, focus distribution, grade pyramid, weekly summary |
| `InsightService` | Run rules and models for a boulder, store insights, record insight feedback |
| `ModelService` | Train (in the compute pool), registry, shadow evaluation, promote / rollback, per-user boundary offset |
| `LabelService` | Store labels from commit / confirm / feedback; export datasets |
| `TrashService` | Soft delete, restore, purge after 30 days (labels are kept) |
| `BundleService` | Export / import zip bundles |
| `SettingsService`, `JobService`, `DiagnosticsService`, `BackupService` | Settings, job control, diagnostics export (no media), daily DB backups |

Every mutation runs in one DB transaction. Files are written to a temp path and atomically
renamed before the transaction that references them commits; a periodic `gc-files` job deletes
orphans.

#### Job system

- `jobs` table: `id, type, status (queued|running|succeeded|failed|cancelled), steps (JSON:
  per-step status), progress, payload, result, error, attempt, createdAt, startedAt,
  finishedAt`.
- Pipelines are DAGs of named, idempotent steps. Each step writes its artifact and records
  completion, so a crash or restart resumes every incomplete step whose inputs exist.
- Resource classes: `pose` (1 concurrent), `ffmpeg` (2 concurrent), `compute` (CPU cores − 1),
  `idle` (runs only when nothing else is queued). Retries: up to 3 with exponential backoff
  for transient failures (runtime crash, disk busy); validation failures are not retried.
- Cancellation: `AbortSignal` propagated to child processes (SIGTERM, then SIGKILL after 5 s)
  and to the pose runtime.

Ingest pipeline (DAG):

```
quick-hash ─► probe ─┬─► activity ─► pose (active windows, 15 fps) ─► preprocess ─► detect ─► propose ─┐
                     │                                                                              ├─► loupes
                     └─► proxy (720p H.264 SDR, 0.5 s GOP) ─► filmstrip ─────────────────────────────┘
full-hash (idle)
```

- `probe` reads packets, not frames (`ffprobe -show_packets`): PTS table, keyframe flags,
  codec, rotation, HDR transfer, VFR. No decode.
- `activity` decodes keyframes only (`-skip_frame nokey`, 160 px grayscale; 2 fps full decode
  if the GOP is > 2 s), computes activity energy and global camera motion, writes
  `signals/<videoId>.json`, and sets the camera-moving warning.
- `pose` decodes only the active windows once through ffmpeg (hardware decode where
  available), scales to the model input size and converts HDR to SDR at that small size, and
  streams frames to the pose runtime. It reports a chunk every 30 s of video; `detect` runs on
  the accumulated track and finalizes items ending > 10 s before the processed frontier.
- `proxy` runs in parallel with pose. HDR sources are tone-mapped (GPU filters where the build
  has them, else CPU `zscale` + `tonemap` at 720p). The review screen becomes playable when the
  proxy is done; proposals may already be waiting.
- `loupes` pre-renders frame strips (every frame, ± 1.5 s, 120 px) around each proposed
  boundary from the proxy, so dragging a handle shows exact frames without seeking.

Other pipelines:

| Pipeline | Steps |
| --- | --- |
| `commit-cuts` | per item: `cut` (lossless by default) → `probe-clip` → `clip-proxy` (when the source is HDR or > 1080p; HEVC SDR clips play directly on macOS, and HDR clips get an SDR proxy so overlays and side-by-side comparisons look consistent) → `thumbnail` → `slice-pose` (15 fps, re-based to clip time) → `segment-moves` (on the climb range) → `create-attempt`; then labels for the whole commit; then at `idle`: `pose-hq` (30 fps on the clip) → `segment-moves` → `attempt.updated` |
| `recut` | same as `commit-cuts` for one attempt, from the original |
| `reprocess` | `scope: active` reruns detection on the stored track; `scope: full` runs pose on the whole recording (fallback when the activity pass missed an attempt) |
| `select-track` | `preprocess` with the chosen track → `detect` → `propose` (merged into the draft, user-edited items untouched) |
| `compare` | `load-tracks` (HQ tracks, same pose model required) → `align` → `compare` → `write-result` |
| `recompute-derived` | after an `engineVersion` bump: moves, features, insights from stored pose tracks; comparisons recompute on open |
| `export` | `render-overlay` (`@napi-rs/canvas` frames) → `ffmpeg-compose` |
| `train-model` | `build-dataset` (engine features) → `trainLogistic` (compute pool) → `evaluate` → `register` (status `shadow`) |
| `bundle-export` / `bundle-import` | `collect` → `zip` / `unzip` → `verify` (hashes, schema version) → `insert` |
| `cleanup-originals` | find originals past retention → prompt via event (never deletes silently) |
| `purge-trash`, `backup-db` | daily at `idle` |

#### Storage layout

```
<libraryRoot>/
  library.db                    SQLite (WAL mode)
  originals/<yyyy>/<mm>/<id>.<ext>
  clips/<id>.mp4
  proxies/<videoId>.mp4         review proxies (originals) and playback proxies (clips)
  pose/<videoId>-<kind>.posebin detection (15 fps) and hq (30 fps) tracks
  signals/<videoId>.json        activity, camera motion, active windows
  thumbs/<videoId>/poster.jpg, filmstrip-<n>.jpg
  loupes/<videoId>/<itemId>-<start|end>.jpg
  comparisons/<id>.bin
  models/<kind>/<version>.json
  exports/  backups/  logs/
```

The library root is chosen on first run (default `~/Movies/Climbing Coach Library`).
`backup-db` uses the SQLite online backup API daily (keeps 7) and before every migration.

macOS storage rules:

- The library root may not be inside iCloud Drive, Dropbox, or another sync folder (detected
  by path and by the `com.apple.file-provider` attributes): syncing a live SQLite WAL database
  corrupts it. Bundles are the supported way to move a library.
- Choosing a folder in Documents, Desktop, Downloads, or on an external drive triggers the
  macOS privacy prompt once; the app explains it before the prompt. An external library that
  is unplugged shows a "library unavailable" screen instead of failing jobs.
- `proxies/`, `loupes/`, `thumbs/`, and `logs/` are rebuildable and are excluded from Time
  Machine (`com.apple.metadata:com_apple_backup_excludeItem` attribute); originals, clips,
  pose tracks, signals, the database, and backups are not.

#### Data model (Drizzle tables)

All user-data tables carry `createdAt`, `updatedAt`, and `deletedAt` (soft delete and sync
tombstones); mutable rows carry `version`.

| Table | Key columns |
| --- | --- |
| `climbers` | `id, name, heightCm, gradeSystem` (one row in v1; kept for sync) |
| `gyms` | `id, name, notes` |
| `boulders` | `id, gymId, name, grade, difficultyIndex, color, setOn, retiredOn, wallPhotoPath` |
| `sessions` | `id, gymId, date (YYYY-MM-DD local), tzOffsetMin, startedAt, endedAt` |
| `videos` | `id, kind (original\|clip), sessionId, discipline (boulder\|route), path, proxyPath, quickHash, sha256, durationUs, displayWidth, displayHeight, rotation, codec, isHdr, isVfr, recordedAt, reviewState (unreviewed\|in_review\|done), reviewRevision, warnings (JSON), sourceVideoId, sourceStartUs, sourceEndUs` |
| `pose_tracks` | `id, videoId, kind (detection\|hq), runtime, model, modelVersion, sampleFps, windows (JSON), path, selectedTrackId` |
| `review_items` | `id, videoId, origin (detector\|manual), detectorVersion, detectedClimbStartUs, detectedClimbEndUs, detectedOutcome, confidence, derivedFrom (JSON: split / merge of detected ids), climbStartUs, climbEndUs, prePadUs, postPadUs, outcome, boulderId, proximity, exertion, tags (JSON), touched, status (draft\|rejected\|committed), attemptId` |
| `attempts` | `id, clipVideoId, sessionId, boulderId, discipline, climbStartUs, climbEndUs (clip time), outcome (fall\|drop\|top\|unknown), outcomeSource (auto\|confirmed), fallMoveIndex, proximity (1–5), exertion (1–10), notes, recordedAt, ratedAt` |
| `tags`, `attempt_tags` | structured tags (balanced, powerful, pumped, beta change, custom) |
| `move_segments` | `id, attemptId, poseTrackId, engineVersion, index, limb (lh\|rh\|lf\|rf), startUs, endUs, holdX, holdY` |
| `comparisons` | `id, attemptAId, attemptBId, poseModel, engineVersion, optionsHash, resultPath, summary (JSON)` |
| `training_logs` | `date (PK, YYYY-MM-DD local), tzOffsetMin, sessionExertion, exertionSource (prefill\|user), boulderCount, routeCount, durationMin, sessionType, primaryFocusId, body (JSON), notes, load (derived)` |
| `training_log_focus`, `focus_tags` | secondary focus tags, built-in + custom |
| `training_log_grades` | `date, discipline (boulder\|route), grade, attempted, sent` |
| `labels` | `id, kind, subjectId, subjectDeleted, predicted (JSON), final (JSON), deltaStartUs, deltaEndUs, sourceVersion` |
| `insights` | `id, boulderId, attemptId, kind, text, evidence (JSON), sourceVersion, feedback` |
| `models` | `id, kind, version, path, featureSpecVersion, metrics (JSON), status (shadow\|active\|retired), datasetHash, trainedAt` |
| `jobs`, `settings` | see job system; key/value settings (padding, retention, boundary offsets, …) |

Indexes: `attempts(boulderId, recordedAt)`, `attempts(sessionId)`, `review_items(videoId,
status)`, `labels(kind, createdAt)`, `jobs(status, createdAt)`, `videos(quickHash)`, and
`deletedAt` partial indexes on every soft-deletable table.

Deletion: deleting anything moves it to the trash (restorable for 30 days). Purging an
original removes the file; clips and attempts remain (`sourceVideoId` stays for history,
re-cut returns 410). Purging an attempt removes its clip, proxy, pose tracks, moves, and
comparisons; its labels stay with `subjectDeleted = true`, so training data is not lost.

#### Security (local server)

- Bound to `127.0.0.1` on a random free port.
- Every API request needs `Authorization: Bearer <launchToken>` (generated per launch, passed
  to the renderer through the preload `contextBridge`). Events use fetch-based SSE
  (`@microsoft/fetch-event-source`) so they can send the same header; `EventSource` cannot.
- `Host` must be `127.0.0.1:<port>` or `localhost:<port>`. `Origin` must be `app://-` (the
  packaged renderer) or the Vite dev origin in development builds only. This blocks DNS
  rebinding and other local web pages.
- `<video>` and `<img>` cannot send headers, so media uses signed URLs (`?sig=<HMAC-SHA256>`
  over path and variant) with a per-launch key. They stay valid for the whole app session; a
  stale URL after relaunch gets 403 and the client refetches the DTO.
- File serving is restricted to the library root (path traversal guard). Electron runs with
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and a strict CSP.
- No outbound network calls except the opt-in update check (and Photos downloading an
  iCloud original, which is done by the system on the user's request).
- The app is signed with the hardened runtime and only the entitlements Electron and ONNX
  Runtime need (JIT for V8); no camera or microphone entitlement on desktop.

### 3.3 Frontend architecture

#### Web routes (`apps/web`, TanStack Router)

| Route | Page | Main components |
| --- | --- | --- |
| `/` | Home: training log and graphs | `TodayEntryForm`, `WeeklySummaryStrip`, `TrainingLoadChart` + `AcwrIndicator`, `ExertionVolumeScatter`, `FocusDistributionChart`, `GradePyramid`, `RecentSessionsStrip` |
| `/library` | Attempts grid | `AttemptFilters`, `AttemptGrid`, `AttemptCard` |
| `/recordings` | Originals with derived clips and review state | `RecordingList`, `ProcessingStatus`, `RecordingWarnings`, `RecutAction` |
| `/recordings/:id/review` | Auto-cut review | see component tree below |
| `/attempts/:id` | Player + rating | `AttemptPlayer`, `OverlayModeToggle`, `MoveList`, `RatingPanel` (`ProximityScale`, `ExertionScale`, outcome, fall-move picker, tags, notes), `CompareWithButton` |
| `/boulders/:id` | Boulder history | `BoulderHeader`, `AttemptHistoryTable`, `ProximityExertionScatter`, `InsightsPanel` |
| `/compare?a=&b=` | Comparison | `DualPlayer`, `GhostOverlay`, `SyncModeToggle`, `DivergenceTimeline`, `MoveDifferencePanel`, `AlignmentFeedbackButton` |
| `/trash` | Deleted items | `TrashList`, restore / purge actions |
| `/settings` | Settings | padding, retention, default discipline, grade system, library root; advanced: pose model (with a warning that comparisons need matching models) |
| `/diagnostics` | Detector health, models, jobs, logs | `DetectorHealthPanel`, `ModelRegistryTable`, `JobList` |

Review screen component tree:

```
ReviewPage
 ├─ RecordingWarnings (camera moving, HDR source, routes: detection off)
 ├─ VideoPlayer (proxy stream, frame clock)
 │   ├─ SkeletonOverlay (toggle)
 │   └─ TrackPicker ("Wrong climber?": boxes of all tracks on the current frame)
 ├─ ProposalTimeline
 │   ├─ FilmstripTrack (sprite tiles)
 │   ├─ ActivityTrack (activity energy, on-wall score, hip speed)
 │   └─ ProposalRange × n (climb handles; padding shown as shaded extensions;
 │                         context menu: split / merge / reject)
 ├─ HandleLoupe (pre-rendered frame strip around the active handle)
 ├─ ProposalList (outcome, boulder picker defaulting to the previous item + quick-create,
 │                proximity, exertion, tags, status)
 └─ CommitBar (cut mode, commit selected, undo / redo)
```

The handles mark the climb itself: first frame on the wall and the fall/top frame. Padding is
added only when cutting, so what the user drags is exactly what the detector predicted, and
the difference is a clean label.

Review keyboard map: Space play/pause, ←/→ one frame, Shift+←/→ 0.5 s, `I`/`O` set climb
start/end of the active item at the playhead, `S` split at playhead, `Delete` reject, `Tab`
next item, `1`–`5` proximity, `Enter` commit selected, Cmd+Z / Shift+Cmd+Z undo/redo (also in the Edit menu).

#### State management rules

- Server state lives only in TanStack Query (keys per resource; events invalidate keys).
- The review draft is client state in `reviewStore` (Zustand + immer patches for undo/redo),
  autosaved with `PUT /recordings/:id/review` (debounced 1 s and on leave). Server-side
  detector updates arrive as `review.updated` and are merged into the draft by the same
  `mergeDetectorUpdate` function the server uses.
- Other ephemeral state: `playerStore` (current time, playing, rate), `compareStore` (sync
  mode, overlay opacity).
- Ratings and attempt edits are optimistic with rollback on error.
- Forms use React Hook Form with resolvers built from `api` Zod schemas, so client and server
  validation are identical.
- All user-visible strings go through Lingui; a lint rule rejects literal JSX text.

#### Video timing (frame accuracy)

- Media time is integer microseconds from stream start (`Us`). The server provides the frame
  timestamp table per video (from packets), so frame stepping is "seek to the next PTS", not
  "add 1/fps" (phones record variable frame rate).
- Seek target is `pts + 0.5 frame` to avoid landing on the previous frame;
  `requestVideoFrameCallback` `mediaTime` tells the overlay which frame is on screen.
- The review proxy is encoded with timestamps passed through, so a boundary picked on the
  proxy is exactly the same instant in the original.
- While a handle is dragged, the loupe shows pre-rendered frames instantly and the main player
  seeks at most every 100 ms; it settles on release. A loupe is regenerated when a handle moves
  outside its window. WebCodecs decoding is the upgrade path if this is not smooth enough.

#### Comparison playback controller (`hooks/compare`)

- Inputs are the two attempts' climb ranges, not the padded clips.
- Two modes: *movement-synced* (default) and *real time*.
- Movement-synced walks the warp path: A is the master clock; B's target time is looked up
  from the path; B's `playbackRate` is set from the local slope of the path (clamped
  0.25×–4×), and B is hard-seeked when drift exceeds one frame. In collapsed rest regions one
  video holds on its frame while the other plays through its rest.
- Unmatched segments ("no counterpart") show a dimmed panel with a label.
- Both players use playback proxies, so two 4K HEVC streams are never decoded at once.

#### Rendering (`render`)

`renderPose(frame, options) → DrawCommand[]` and `renderGhost(a, b, divergence, options)`
produce painter-agnostic commands; the web paints them on Canvas 2D, mobile with Skia, export
with `@napi-rs/canvas`. Visual snapshot tests run on the export painter in the pinned Linux
container.

#### Mobile frontend (`apps/mobile`)

- Navigation (Expo Router): tabs Home / Library / Record / Boulders; stacks for review,
  attempt, compare.
- Same `app-hooks` and `CoachApi` interface; the in-process implementation replaces HTTP.
- Platform-specific views: touch handles with haptic ticks per frame, pinch-zoom timeline,
  Skia overlays on a video player, victory-native charts, share sheet for bundles.
- Two ways in: the capture screen and import from Photos (PHPicker on iOS, Photo Picker on
  Android), including download progress for iCloud-offloaded videos.
- Capture screen: vision-camera at 1080p30, H.264, HDR off by default; framing guide;
  stability indicator from `expo-sensors` DeviceMotion; optional exposure/focus lock; a
  finished recording goes straight into `ingest`. The UI suggests one recording per attempt or
  short bursts, which keeps on-device processing short.

### 3.4 Data formats

- **IDs:** ULID strings, generated by `core` on either platform.
- **Time:** media time `Us` (integer microseconds); wall-clock ISO 8601 UTC (`*At`); calendar
  days `YYYY-MM-DD` in the climber's local time with `tzOffsetMin`. Attempts get their day from
  their session (confirmed at import, defaulting to the file's creation time, then import
  time), never from the file timestamp alone; sessions crossing midnight belong to the day they
  started.
- **Skeleton topology:** canonical 33-point BlazePose layout. Models with other layouts are
  mapped into it; unmapped points are `NaN`. The engine only depends on 17 core points (nose,
  shoulders, elbows, wrists, hips, knees, ankles, heels, foot index).
- **Coordinate space:** pose coordinates are normalized to the *display* orientation (rotation
  metadata applied), recorded in the posebin header together with the source rotation.
- **posebin** (pose track file):

  ```
  offset   size      field
  0        8         magic "POSEBIN\0"
  8        4         uint32 format version (1)
  12       4         uint32 header length H
  16       H         UTF-8 JSON header (PoseTrackHeader: videoId, kind, runtime, model,
                     sampleFps, windows, coordinateSpace: "display", display size, rotation,
                     tracks [{ trackId, firstFrame, lastFrame }], selectedTrackId)
  …        pad to 8-byte alignment
  …        8 × N     Float64 tUs[N]               sampled frame timestamps (N = frameCount)
  …        per track k: Float32 [N_k × 33 × 4]  x, y (normalized display coords), z, visibility; NaN = missing
  ```

  `Float64` timestamps are deliberate: `Float32` loses microsecond precision after ~16 s.
  Frames outside active windows are simply absent (gaps in `tUs`).

- **signals** (`signals/<videoId>.json`): sampled activity energy, global motion vectors,
  active windows, warnings.
- **Comparison result** (`comparisons/<id>.bin`): Int32 warp path pairs `[L × 2]` + Float32
  divergence `[L × J]` (8 joint angles + 2 composite metrics); summary JSON in the DB.
- **Model artifact** (`models/<kind>/<version>.json`): `{ kind, version, algo: "logreg" |
  "gbdt", featureSpecVersion, classes?, standardization, coefficients? | trees?, metrics,
  trainedOn: { datasetHash, n } }`.
- **Labels export:** JSONL rows `{ subjectId, kind, features: number[], featureSpecVersion,
  target, sourceVersion }` plus `feature_spec.json`.
- **Bundle:** `manifest.json` (schema version, file hashes) + all rows in scope (including
  labels, insight feedback, settings, model registry) + clips, proxies, pose tracks, signals,
  model artifacts, and optionally originals.

---

## 4. API details

### 4.1 Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `http://127.0.0.1:{port}/api/v1` |
| Auth | `Authorization: Bearer {launchToken}` on all requests including events; media through signed URLs |
| Format | JSON, camelCase; binary endpoints return `application/octet-stream` |
| Time | `*Us` integer microseconds (media), `*At` ISO 8601 UTC, dates `YYYY-MM-DD` |
| Pagination | `?limit=50&cursor=…` (max 200) → `{ items, nextCursor }` |
| Concurrency | Mutable resources carry `version`; `PATCH`/`PUT` accept `expectedVersion` → 409 on mismatch. The review draft uses `revision` / `baseRevision` |
| Deletion | `DELETE` moves to trash; `POST /trash/…/restore` restores; purge after 30 days |
| Long operations | `202 Accepted` with `{ jobId, … }`; progress through events or `GET /jobs/:id` |
| Errors | `application/problem+json` (4.5) |
| Versioning | Path version `/v1`; additive changes only within v1; `schemaVersion` in `/health` |

### 4.2 Endpoint reference

System

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | App, engine, schema, ffmpeg, and pose runtime / model versions and status |
| GET | `/events` | SSE stream (4.4), consumed with fetch so the auth header is sent |
| GET / PATCH | `/settings` | Padding, retention, default discipline, grade system, pose model |
| POST | `/feedback` | `{ category, message, includeDiagnostics }` |
| POST | `/diagnostics/export` | 202 → zip of logs and versions (no media) |

Gyms, boulders, sessions

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/gyms` | List / create |
| PATCH / DELETE | `/gyms/:id` | Update / delete |
| GET / POST | `/boulders` | Filters `gymId, active, gradeMin, gradeMax, q`; `POST` accepts minimal `{ name?, grade, color, gymId }` for quick-create |
| GET / PATCH / DELETE | `/boulders/:id` | `GET` includes `stats { attempts, sends, bestProximity, lastAttemptAt }` |
| GET | `/boulders/:id/progress` | Proximity-vs-exertion points, one per attempt, with session id |
| GET | `/boulders/:id/insights` | Insights for this boulder |
| GET / POST | `/sessions` | Filters `from, to, gymId` |
| GET / PATCH | `/sessions/:id` | Session with its attempts |

Recordings and auto-cut review

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/recordings` | Import by path `{ sourcePath, importMode: copy\|move\|reference, sessionId?, discipline? }` → 202 |
| POST | `/recordings/upload` | Multipart upload (browser dev mode only) → 202 |
| GET | `/recordings` | Filters `reviewState, sessionId`; processing status, warnings, clip counts |
| GET / DELETE | `/recordings/:id` | Metadata, processing state, derived clips, media URLs / move to trash |
| POST | `/recordings/:id/reprocess` | `{ scope: active\|full }` → 202 |
| GET | `/recordings/:id/filmstrip` | `?startUs&endUs&count&width` → `{ spriteUrl, tiles: [{ tUs, x, y, w, h }] }` |
| GET | `/recordings/:id/loupe` | `?atUs` → loupe strip for a position outside the pre-rendered windows |
| GET | `/recordings/:id/signals` | Activity, on-wall score, hip speed, warnings (downsampled) |
| GET | `/recordings/:id/tracks?atUs` | Person tracks with their boxes at a time, and the selected track |
| POST | `/recordings/:id/tracks/select` | `{ trackId }` → 202; re-detects, never changes user-edited items |
| GET | `/recordings/:id/review` | `{ revision, reviewState, items, detected, processing }` |
| PUT | `/recordings/:id/review` | `{ baseRevision, items }` (autosave) → new revision; 409 with the current state on revision mismatch |
| POST | `/recordings/:id/review/commit` | `{ itemIds?, cutMode: lossless\|reencode\|auto }` → 202; rejects overlapping climb ranges |

Media and pose

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/media/videos/:videoId?variant=original\|proxy&sig` | Video stream with range requests (originals and clips) |
| GET | `/media/thumbs/:videoId/:name?sig` | Poster, filmstrip, and loupe images |
| GET | `/videos/:id/frames` | Frame timestamp table (Float64 binary) |
| GET | `/videos/:id/pose?kind=detection\|hq&fromUs&toUs` | posebin slice |

Attempts and tags

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/attempts` | Filters `boulderId, sessionId, recordingId, discipline, outcome, from, to, proximityMin/Max, exertionMin/Max, tag, rated`; `sort` |
| GET / PATCH / DELETE | `/attempts/:id` | `PATCH { proximity?, exertion?, outcome?, fallMoveIndex?, climb?, boulderId?, tags?, notes?, expectedVersion? }` (`climb` adjusts the climb range inside the clip without re-cutting) |
| GET | `/attempts/:id/moves` | Move segments |
| POST | `/attempts/:id/recut` | `{ climb (original time), padding?, cutMode }` → 202; 410 if the original is purged |
| POST | `/attempts/:id/export` | `{ overlay: none\|skeleton\|trail, format: mp4\|gif }` → 202 |
| GET / POST | `/tags` | List / create custom tags |

Comparisons

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/comparisons` | `{ attemptAId, attemptBId, options { collapseRests, spatialMode } }` → 200 if cached, else 202; 409 `POSE_MODEL_MISMATCH` offers re-extraction |
| GET | `/comparisons/:id` | Status, move matches, summary, binary URLs |
| GET | `/comparisons/:id/warp` | Int32 warp path |
| GET | `/comparisons/:id/divergence` | Float32 divergence series |
| POST | `/comparisons/:id/feedback` | `{ moveIndexA, verdict: aligned\|misaligned, note? }` |
| POST | `/comparisons/:id/export` | Side-by-side or ghost video → 202 |

Training log and stats

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/training-logs?from&to` | Entries in range |
| GET | `/training-logs/:date` | `{ entry \| null, prefill }` |
| PUT | `/training-logs/:date` | Upsert the day |
| DELETE | `/training-logs/:date` | Remove the day |
| GET / POST | `/focus-tags` | Built-in + custom focus tags |
| GET | `/stats/training-load?from&to&method=rolling\|ewma` | Daily load, short/long averages, ACWR, band |
| GET | `/stats/exertion-volume?from&to` | Per-day exertion and volume points |
| GET | `/stats/focus-distribution?from&to&bucket=week\|month` | Stacked counts per focus |
| GET | `/stats/grade-pyramid?from&to&discipline=boulder\|route` | Sends per grade |
| GET | `/stats/weekly-summary?week=YYYY-Www` | Sessions, total load, hardest send, days since rest |

Insights, models, labels

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/insights?boulderId&attemptId` | Insights with evidence |
| POST | `/insights/:id/feedback` | `{ verdict: useful\|not_useful\|wrong }` |
| GET | `/models` | Registry with metrics and status |
| POST | `/models/train` | `{ kind }` → 202 |
| POST | `/models/:id/promote` | Shadow → active (previous active → retired) |
| POST | `/models/:id/rollback` | Re-activate the previous version |
| GET | `/detector-health?from&to` | Feedback-loop metrics (7.1) |
| POST | `/labels/export` | `{ kind }` → 202 → JSONL + feature spec |

Trash, jobs, bundles

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/trash` | Soft-deleted recordings, attempts, boulders, logs |
| POST | `/trash/:kind/:id/restore` | Restore |
| DELETE | `/trash/:kind/:id` | Purge now |
| GET | `/jobs?status&type` | List |
| GET | `/jobs/:id` | Status, per-step state, progress, error |
| POST | `/jobs/:id/cancel` | Cancel |
| POST | `/jobs/:id/retry` | Retry incomplete steps |
| POST | `/bundles/export` | `{ scope { boulderIds?, from?, to? }, includeOriginals }` → 202 |
| POST | `/bundles/import` | `{ path }` → 202 |

### 4.3 Example payloads

Import a recording:

```http
POST /api/v1/recordings
{ "sourcePath": "/Users/me/Movies/IMG_4211.MOV", "importMode": "copy",
  "sessionId": "01JAB2…", "discipline": "boulder" }

202 Accepted
{ "recording": { "id": "01JAB3…", "status": "processing", "durationUs": 245300000,
                 "warnings": ["hdr_source"] },
  "jobId": "01JAB3…" }
```

Load the review (processing still running):

```json
{
  "revision": 4,
  "reviewState": "in_review",
  "detected": [
    { "id": "01JAB4…", "climb": { "startUs": 12400000, "endUs": 31850000 },
      "outcome": "fall", "confidence": 0.82, "detectorVersion": "1.2.0+o-0.13" }
  ],
  "items": [
    { "id": "01JAB5…", "origin": "detector", "detectedId": "01JAB4…", "touched": false,
      "climb": { "startUs": 12400000, "endUs": 31850000 },
      "padding": { "preUs": 2000000, "postUs": 1500000 },
      "clip": { "startUs": 10400000, "endUs": 33350000 },
      "outcome": "fall", "boulderId": null, "proximity": null, "exertion": null,
      "tags": [], "status": "draft" }
  ],
  "processing": { "complete": false, "processedUntilUs": 120000000, "proxyReady": true }
}
```

`clip` is derived (`climb` ± `padding`, clamped to the video) and read-only. `detectorVersion`
includes the per-user boundary offset (`o-0.13` = −0.13 s start correction) so labels can be
interpreted later.

Fine-tune, rate, and commit:

```http
PUT /api/v1/recordings/01JAB3…/review
{ "baseRevision": 4,
  "items": [ { "id": "01JAB5…", "origin": "detector", "detectedId": "01JAB4…", "touched": true,
               "climb": { "startUs": 12950000, "endUs": 31850000 },
               "padding": { "preUs": 2000000, "postUs": 1500000 },
               "outcome": "top", "boulderId": "01J9ZK…", "proximity": 5, "exertion": 8,
               "tags": [], "status": "draft" } ] }
→ 200 { "revision": 5, … }

POST /api/v1/recordings/01JAB3…/review/commit
{ "cutMode": "auto" }
→ 202 { "jobId": "01JAB6…" }
```

`auto` = lossless (keyframe-expanded outward) unless the expansion exceeds 2 s on a side, in
which case the clip is fully re-encoded with the hardware encoder. The attempt's exact climb
range is stored separately, so keyframe slack in the file does not matter.

Labels derived at commit (`engine/cut/deriveLabels`): adjusted detector items → start/end
deltas; rejected detector items → false positive; manual items overlapping no detection →
false negative; items split from one detection → merged-detection error; items merged from
several detections → split-detection error.

Rate an attempt later:

```http
PATCH /api/v1/attempts/01JAB7…
{ "proximity": 4, "exertion": 7, "outcome": "fall", "fallMoveIndex": 5,
  "tags": ["pumped"], "notes": "Left heel hook slipped", "expectedVersion": 2 }
```

Log a training day:

```http
PUT /api/v1/training-logs/2026-10-15
{ "sessionExertion": 7, "exertionSource": "user",
  "boulderCount": 14, "routeCount": 0,
  "grades": [ { "discipline": "boulder", "grade": "V5", "attempted": 3, "sent": 1 } ],
  "focus": { "primary": "strength", "secondary": ["technique"] },
  "sessionType": "climbing", "durationMin": 110,
  "body": { "fingers": "ok", "skin": "thin", "joints": "ok" }, "notes": "",
  "tzOffsetMin": 60 }

200 OK  → same entry + { "load": 770, "version": 1 }
```

Prefill (`GET /training-logs/2026-10-15` with no entry yet):

```json
{ "entry": null,
  "prefill": { "sessionExertion": 8, "basis": { "attempts": 12, "mean": 6.4, "max": 9 },
               "boulderCount": 7, "grades": [ { "discipline": "boulder", "grade": "V5", "attempted": 3, "sent": 1 } ] } }
```

Session exertion prefill = round(0.5 × max + 0.5 × mean) of that day's attempt exertions; the
mean alone underestimates a session's effort. The basis is shown next to the field.

Training load:

```json
{
  "unit": "AU (session exertion × minutes)",
  "method": "rolling",
  "days": [
    { "date": "2026-10-15", "logged": true, "rest": false, "load": 770,
      "short": 305.7, "long": 270.1, "acwr": 1.13, "band": "steady" }
  ]
}
```

`rolling`: short = 7-day average, long = 28-day average. `ewma`: exponentially weighted
averages with 7- and 28-day time constants, which avoid the coupling artifacts of rolling
windows. Bands: < 0.8 `detraining`, 0.8–1.3 `steady`, 1.3–1.5 `caution`, > 1.5
`ramping_fast`. Averages use logged days only: explicit rest days count as load 0, days with
no entry are excluded. A 7-day window with fewer than 4 logged days, or a 28-day window with
fewer than 14, returns `acwr: null` and band `insufficient_data`. Entries without a duration
have `load: null` and are excluded the same way.

Comparison:

```json
{
  "id": "01JAB8…", "status": "ready", "engineVersion": "1.3.0", "poseModel": "rtmpose-m-body26@1",
  "attemptAId": "01JAB7…", "attemptBId": "01JA9X…",
  "moveMatches": [ { "a": 0, "b": 0, "cost": 0.12 }, { "a": 1, "b": null }, { "a": 2, "b": 1, "cost": 0.31 } ],
  "summary": {
    "meanDivergence": 0.21,
    "topDifferences": [
      { "moveIndexA": 3, "joint": "rightHip", "metric": "angleDeg", "meanDelta": 15.2,
        "text": "Right hip 15° more open through move 3" }
    ]
  },
  "warpUrl": "/api/v1/comparisons/01JAB8…/warp",
  "divergenceUrl": "/api/v1/comparisons/01JAB8…/divergence"
}
```

### 4.4 Events (SSE `GET /events`)

```
event: job.progress
data: {"jobId":"01JAB6…","type":"ingest","step":"pose","progress":0.42,"etaMs":31000}
```

| Event | Payload |
| --- | --- |
| `job.progress` | `jobId, type, step, progress (0–1), etaMs?` |
| `job.completed` / `job.failed` | `jobId, type, result? / error (problem)` |
| `review.updated` | `recordingId, revision, processedUntilUs, complete, proxyReady` |
| `recording.warning` | `recordingId, kind (camera_moving\|hdr_source\|no_attempts_found)` |
| `attempt.created` / `attempt.updated` | `attemptId` |
| `comparison.ready` | `comparisonId` |
| `model.registered` / `model.promoted` | `modelId, kind, status` |
| `originals.retention_due` | `videoIds` |

Clients reconnect with the `Last-Event-ID` header; the server keeps a 5-minute ring buffer.

### 4.5 Errors

```json
{ "type": "https://climbing-coach.app/problems/climb-overlap",
  "title": "Climb ranges overlap", "status": 409, "code": "CLIMB_OVERLAP",
  "detail": "Item 01JAB5… (10.95s–31.85s) overlaps item 01JABA… (30.10s–52.00s)",
  "errors": [ { "path": "items[0].climb.endUs", "message": "must be ≤ 30100000" } ] }
```

| Code | Status |
| --- | --- |
| `VALIDATION_FAILED` | 400 |
| `UNAUTHORIZED` / `FORBIDDEN_ORIGIN` / `INVALID_SIGNATURE` | 401 / 403 / 403 |
| `NOT_FOUND` | 404 |
| `VERSION_CONFLICT`, `REVIEW_REVISION_CONFLICT`, `CLIMB_OVERLAP`, `ALREADY_COMMITTED`, `POSE_MODEL_MISMATCH` | 409 |
| `ORIGINAL_DELETED` | 410 |
| `UNSUPPORTED_MEDIA` (including corrupt or truncated files) | 415 |
| `POSE_RUNTIME_UNAVAILABLE`, `FFMPEG_UNAVAILABLE` | 503 |
| `STORAGE_FULL` | 507 |

### 4.6 Internal interfaces

`CoachApi` (in `packages/api`; implemented by `core`, wrapped by HTTP on desktop):

```ts
export interface CoachApi {
  system: { health(): Promise<Health>; getSettings(): Promise<Settings>; updateSettings(p: SettingsPatch): Promise<Settings> };
  gyms: Crud<Gym, GymInput>;
  boulders: Crud<Boulder, BoulderInput> & { progress(id: Id): Promise<ProgressPoint[]> };
  sessions: Crud<Session, SessionInput>;
  recordings: {
    import(i: ImportInput): Promise<Accepted<Recording>>;
    list(q: RecordingQuery): Promise<Page<Recording>>;
    get(id: Id): Promise<RecordingDetail>;
    remove(id: Id): Promise<void>;
    reprocess(id: Id, scope: 'active' | 'full'): Promise<Accepted>;
    filmstrip(id: Id, q: FilmstripQuery): Promise<Filmstrip>;
    loupe(id: Id, atUs: Us): Promise<Loupe>;
    signals(id: Id): Promise<RecordingSignals>;
    tracks(id: Id, atUs: Us): Promise<TrackList>;
    selectTrack(id: Id, trackId: number): Promise<Accepted>;
  };
  review: {
    get(recordingId: Id): Promise<ReviewState>;
    save(recordingId: Id, d: { baseRevision: number; items: ReviewItem[] }): Promise<ReviewState>;
    commit(recordingId: Id, i: CommitInput): Promise<Accepted>;
  };
  attempts: {
    list(q: AttemptQuery): Promise<Page<Attempt>>;
    get(id: Id): Promise<AttemptDetail>;
    update(id: Id, p: AttemptPatch): Promise<Attempt>;
    remove(id: Id): Promise<void>;
    moves(id: Id): Promise<MoveSegment[]>;
    recut(id: Id, i: RecutInput): Promise<Accepted>;
    export(id: Id, i: ExportInput): Promise<Accepted>;
  };
  media: {
    videoUrl(videoId: Id, variant: 'original' | 'proxy'): Promise<string>; // signed http URL or file:// on mobile
    frames(videoId: Id): Promise<Float64Array>;
    poseTrack(videoId: Id, kind: 'detection' | 'hq', range?: TimeRange): Promise<PoseTrack>;
  };
  comparisons: { create(i: ComparisonInput): Promise<Comparison | Accepted<Comparison>>; get(id: Id): Promise<Comparison>;
                 warp(id: Id): Promise<Int32Array>; divergence(id: Id): Promise<Float32Array>;
                 feedback(id: Id, f: AlignmentFeedback): Promise<void>; export(id: Id, i: ExportInput): Promise<Accepted> };
  trainingLogs: { list(r: DateRange): Promise<TrainingLog[]>; get(date: string): Promise<TrainingLogDay>;
                  put(date: string, e: TrainingLogInput): Promise<TrainingLog>; remove(date: string): Promise<void> };
  stats: { trainingLoad(r: DateRange, method?: 'rolling' | 'ewma'): Promise<TrainingLoadSeries>;
           exertionVolume(r: DateRange): Promise<ExertionVolumePoint[]>;
           focusDistribution(r: DateRange, bucket: 'week' | 'month'): Promise<FocusBucket[]>;
           gradePyramid(r: DateRange, d: Discipline): Promise<GradeCount[]>; weeklySummary(week: string): Promise<WeeklySummary> };
  insights: { list(q: InsightQuery): Promise<Insight[]>; feedback(id: Id, v: InsightVerdict): Promise<void> };
  models: { list(): Promise<ModelInfo[]>; train(kind: ModelKind): Promise<Accepted>; promote(id: Id): Promise<void>; rollback(id: Id): Promise<void> };
  trash: { list(): Promise<TrashItem[]>; restore(kind: TrashKind, id: Id): Promise<void>; purge(kind: TrashKind, id: Id): Promise<void> };
  jobs: { list(q: JobQuery): Promise<Job[]>; get(id: Id): Promise<Job>; cancel(id: Id): Promise<void>; retry(id: Id): Promise<Accepted> };
  bundles: { export(i: BundleExportInput): Promise<Accepted>; import(path: string): Promise<Accepted> };
  events: { subscribe(handler: (e: CoachEvent) => void): () => void };
}
```

Ports (in `packages/core/ports`):

```ts
export interface Frame { tUs: Us; width: number; height: number; data: Uint8Array; format: 'rgb' | 'gray' }

export interface FrameSource {                      // ffmpeg pipe (desktop), AVAssetReader / MediaCodec (mobile)
  keyframes(videoPath: string, o: { maxSide: number; signal: AbortSignal }): AsyncIterable<Frame>;
  frames(videoPath: string, o: { windows: TimeRange[]; sampleFps: number; maxSide: number;
                                 toSdr: boolean; signal: AbortSignal }): AsyncIterable<Frame>;
}

export interface PoseExtractor {                    // ONNX Runtime or MediaPipe Tasks, per ADR-001
  info(): PoseRuntimeInfo;                          // { runtime, model, modelVersion, inputSize }
  extract(frames: AsyncIterable<Frame>, out: PoseTrackWriter,
          o: { maxPersons: number; signal: AbortSignal; onProgress(p: Progress): void;
               onChunk(processedUntilUs: Us): void }): Promise<PoseExtractSummary>;
}

export type CutMode = 'lossless' | 'reencode' | 'auto';

export interface VideoTools {
  probe(path: string): Promise<ProbeResult>;        // from packets: PTS table, keyframes, codec, rotation, HDR, VFR
  quickHash(path: string): Promise<string>;         // size + 3 × 4 MB samples
  fullHash(path: string, signal: AbortSignal): Promise<string>;
  makeProxy(src: string, dst: string, o: ProxyOptions & TaskOpts): Promise<void>;   // SDR, 0.5 s GOP, PTS passthrough
  cut(src: string, dst: string, range: TimeRange, mode: CutMode, o: TaskOpts):
    Promise<{ actualRange: TimeRange; modeUsed: 'lossless' | 'reencode'; frameCount: number }>;
  thumbnail(src: string, atUs: Us, dst: string, width: number): Promise<void>;
  filmstrip(src: string, range: TimeRange, count: number, dst: string, tileWidth: number): Promise<FilmstripLayout>;
  loupe(src: string, centerUs: Us, halfWindowUs: Us, dst: string, tileWidth: number): Promise<LoupeLayout>;
}

export interface ComputePool {
  run<K extends keyof EngineTasks>(task: K, input: EngineTasks[K]['in'], signal?: AbortSignal): Promise<EngineTasks[K]['out']>;
}
```

Engine entry points (pure):

```ts
activeWindows(energy: Float32Array, tUs: Float64Array, durationUs: Us, p?: ActivityParams): TimeRange[];
globalMotion(prev: Frame, next: Frame): { dx: number; dy: number; confidence: number };
preprocess(track: PoseTrack, o?: PreprocessOptions): ProcessedTrack;
detectAttempts(t: ProcessedTrack, p?: DetectorParams): AttemptCandidate[];   // includes exitDirection
detectorSignals(t: ProcessedTrack, p?: DetectorParams): DetectorSignals;
proposeItems(c: AttemptCandidate[], o: { prePadUs: Us; postPadUs: Us }): ReviewItem[];
mergeDetectorUpdate(draft: ReviewItem[], detected: AttemptCandidate[]): ReviewItem[];  // never edits touched items
validateDraft(items: ReviewItem[], durationUs: Us): DraftIssue[];                       // overlap on climb ranges
clipRangeOf(item: ReviewItem, durationUs: Us): TimeRange;
deriveLabels(detected: AttemptCandidate[], final: ReviewItem[]): LabelDraft[];
boundaryOffset(labels: BoundaryLabel[], p?: OffsetParams): { startUs: Us; endUs: Us } | null;
segmentMoves(t: ProcessedTrack, climb: TimeRange, p?: MoveParams): MoveSegment[];
align(a: AlignInput, b: AlignInput, o?: AlignOptions): Alignment;        // { path, moveMatches, unmatchedA, unmatchedB }
comparePostures(a: ProcessedTrack, b: ProcessedTrack, al: Alignment): ComparisonResult;
attemptFeatures(t: ProcessedTrack, moves: MoveSegment[], ctx: AttemptContext): FeatureVector;
trainingStats(logs: TrainingLog[], range: DateRange, method: 'rolling' | 'ewma'): TrainingStats;
prefillTrainingLog(date: string, attempts: AttemptSummary[]): TrainingLogPrefill;
evaluateRules(ctx: BoulderContext): InsightDraft[];
trainLogistic(x: Float32Array[], y: Float32Array, o: { l2: number }): ModelArtifact;
predict(model: ModelArtifact, x: Float32Array): Prediction;              // value + per-feature contributions
```

---

## 5. Development phases

No calendar estimates; phases are ordered by dependency, and each ends with a test gate from
section 6.

### 5.1 Tracks and dependencies

```
Track A — CV engine:  P0 data + bake-off ──► P1 engine, video tools, pose adapter ──► P2-B ingest/review ──► P3 compare ──► P4 ML
Track B — App:        P0 scaffolding ──► P2-A backend, shell, homepage ──► P2-C library/player/rating ──► P2-D packaging
Track C — Mobile:                              P5.1 spikes (after P1) ─────────────────────────────────► P5.2–P5.6
```

Phase 2-A (backend foundation, training log, homepage) has no dependency on computer vision, so
the homepage can be used while the engine is still being tuned. Architecture decisions are
recorded as ADRs: ADR-001 pose model and shipped runtime, ADR-002 ffmpeg build and licensing,
ADR-003 mobile compute (P5.1).

### 5.2 Phase 0 — Foundations, dataset, and decisions

| ID | Work package | Modules | Output |
| --- | --- | --- | --- |
| P0.1 | Monorepo scaffolding: pnpm (hoisted) + Turborepo, config presets, Vitest, ESLint/Prettier, Lingui setup, dependency-cruiser rules, GitHub Actions (Linux and macOS arm64 runners), Apple Developer account and Developer ID certificate in CI secrets, a self-hosted reference Mac for benchmarks, pinned Linux container for visual tests, ADR template, PR template with definition of done | `config`, CI | Green empty pipeline |
| P0.2 | Schema v1: `Us`, ULID, `PoseTrack` (display coordinate space), posebin and signals readers/writers, label JSONL schemas, JSON Schema export; TS ⇄ Python posebin round-trip test | `schema`, `research/pose-lab` | Tagged schema v1 |
| P0.3 | Capture protocol and dataset: camera placement guide and phone settings (H.264, HDR off); 30–50 recordings (≥ 120 attempts) across slab / vert / overhang / roof, lighting, camera positions, ≥ 3 climbers, signed consent, including a few HEVC/HDR and handheld clips as robustness cases; manifest with hashes; private storage; frozen test split (30%) | `docs/capture-protocol.md`, `datasets/` | Dataset v1 |
| P0.4 | Labeling: temporal labels (climb start, climb end, outcome, exit direction, limb placement events) in `research/label-tool`; cross-attempt move correspondences for ≥ 15 attempt pairs; keypoints on ~300 frames (≥ 100 hard: inverted, heel hooks, occluded) in CVAT | `research/label-tool` | Labels v1 |
| P0.5 | Pose lab: MediaPipe (lite/full/heavy), RTMDet + RTMPose body26 (includes feet), YOLO-pose (research only); IoU tracking for multiple people; posebin output for the whole dataset | `research/pose-lab` | Reference pose tracks |
| P0.6 | Bake-off and runtime decision: PCK@0.2 overall and on the hard subset, dropout, jitter on static holds; for each candidate also the shipped runtime (ONNX Runtime in Node with the CoreML provider and on mobile, MediaPipe Tasks in a hidden Electron window and on mobile): CoreML operator coverage (no silent CPU fallback for the main graph), output parity with the Python reference, throughput on the reference Mac and phones, shipped size, usability from the CLI and CI | `research/pose-lab` | ADR-001 |
| P0.7 | Eval harness: `coach eval` (TS) scores detection, moves, and alignment from labels + cached posebins (keyed by video hash, runtime, model, sample fps) and reports metrics with 95% confidence intervals (Wilson for proportions, bootstrap for medians); Python only scores PCK | `apps/cli` (eval), `research/pose-lab` | First eval report on a baseline detector |
| P0.8 | ffmpeg: build LGPL ffmpeg/ffprobe for macOS arm64 in CI with VideoToolbox; verify the codecs and filters the pipeline needs (HEVC/H.264 hardware decode, `h264_videotoolbox` with and without `allow_sw`, `skip_frame`, `zscale`/`tonemap`, scaling, framemd5) on iPhone HEVC/HDR and Dolby Vision samples; sign with the hardened runtime and test inside a notarized dummy app | CI, `adapters-node` | ADR-002, ffmpeg artifacts |

Exit gate: ADR-001 and ADR-002 accepted; schema v1 tagged; test split frozen and hashed; eval
harness reports on the baseline; CI green.

### 5.3 Phase 1 — Engine, video tools, pose adapter (Track A)

Depends on P0.2, P0.6, P0.7, P0.8.

| ID | Work package | Modules |
| --- | --- | --- |
| P1.1 | Activity pass: activity energy, global motion, active windows, camera-moving warning | `engine/activity` |
| P1.2 | Preprocessing: climber track selection, One Euro filter, gap filling, normalization, body metrics, frame features | `engine/pose`, `engine/features` |
| P1.3 | Start / end / outcome detection, floor fallbacks, exit direction, multi-attempt segmentation, detector signals | `engine/detect` |
| P1.4 | Review-draft operations: propose items, clip range, split, merge, overlap validation, detector-update merging, label derivation | `engine/cut` |
| P1.5 | Move segmentation (on climb ranges) and fall move index | `engine/moves` |
| P1.6 | Alignment: move matching, rest collapse, banded and open-end DTW, PCA-reduced fallback | `engine/align` |
| P1.7 | Video tools: probe from packets, quick/full hash, frame source (keyframes, windowed decode, SDR conversion), proxy (SDR, tone-mapping), lossless / reencode / auto cut, thumbnails, filmstrip and loupe sprites | `adapters-node/video` |
| P1.8 | Pose adapter for the ADR-001 runtime (CoreML provider on macOS, CPU provider in Linux CI), with lazy model loading, a CoreML compiled-model cache, and parity tests against the Python reference | `adapters-node/pose` |
| P1.9 | Fixtures: synthetic climber generator (stand → climb → fall / top / downclimb / exit at top; sit start; already on the wall at recording start; second person; walk-out; mid-climb end; long idle gaps), fixture videos (frame number burned in, VFR, rotated portrait, HEVC HDR, long GOP, panning camera, truncated file), fake ports | `test-fixtures` |
| P1.10 | CLI: `coach process <video>`, `coach cut <video> --ranges`, `coach align <a> <b>`, `coach eval`, `coach bench` | `apps/cli` |
| P1.11 | Parameter tuning: grid search over activity and detector parameters on the dev split; results committed with the params file | `apps/cli`, `engine` |

Exit gate: accuracy targets for activity, detection, moves, and alignment (6.3) on the test
split; synthetic-warp property tests; video tool tests on all fixtures; pose parity; engine and
pipeline performance budgets (6.4); coverage thresholds (6.2).

### 5.4 Phase 2 — Desktop MVP

| ID | Work package | Modules | Can start after |
| --- | --- | --- | --- |
| P2-A.1 | DB schema with timestamps and tombstones, migrations, repositories; daily and pre-migration backups | `core/db`, `adapters-node` | P0.2 |
| P2-A.2 | `core` skeleton: ports, services for settings, gyms, boulders, sessions, training logs, stats, trash; DAG job runner with resource classes | `core`, `engine/stats`, `engine/grades` | P2-A.1 |
| P2-A.3 | Server: Fastify, auth, Host/Origin checks, problem+json, fetch-SSE events, signed media URLs, path traversal guard; conformance suite wired to HTTP | `apps/server`, `api` | P2-A.2 |
| P2-A.4 | Web shell: router, design system, hooks (queries, event invalidation), Lingui, settings, trash page, first-run library setup (default folder, sync-folder check, privacy prompt explanation); Electron dev shell with the `app://` protocol, macOS menu bar (app menu, Edit with undo/redo, Window), standard shortcuts (Cmd+, settings, Cmd+O import) | `apps/web`, `apps/desktop` | P2-A.3 |
| P2-A.5 | Homepage: today's entry form with prefill (blend + basis) and overrides, focus tags, grade breakdown; training load (rolling / EWMA) + ACWR, exertion vs. volume, focus distribution, grade pyramid, weekly summary | `apps/web`, `engine/stats` | P2-A.4 |
| P2-B.1 | Ingest DAG (activity, windowed pose, parallel proxy, loupes) with incremental proposals; stable-size check before import; compute pool | `core`, `adapters-node` | P1, P2-A.3 |
| P2-B.2 | Review screen: draft store with undo/redo and autosave, timeline with climb handles and shaded padding, filmstrip, activity track, loupe, split / merge / reject / add, track picker, warnings, outcome, boulder default + quick-create, proximity / exertion / tags, keyboard map | `apps/web` | P2-B.1 |
| P2-B.3 | Commit pipeline: cut, clip proxy, pose slice, moves, attempt creation, label derivation, background `pose-hq` | `core` | P2-B.1 |
| P2-C.1 | Library and recordings views (review state, warnings), filters, re-cut, original retention prompts, soft delete and restore | `apps/web`, `core` | P2-B.3 |
| P2-C.2 | Attempt player: overlay modes (video + skeleton, skeleton only, trail), move markers, climb-range adjustment | `apps/web` (`src/render`) | P2-B.3 |
| P2-C.3 | Rating panel (proximity with anchors, CR10 exertion, outcome, fall move, tags, notes); boulder page with proximity-vs-exertion scatter; prefill wiring to homepage | `apps/web`, `core` | P2-C.2 |
| P2-C.4 | Bundle export / import (doubles as a backup; later the desktop → phone path) | `core/BundleService`, `apps/web` | P2-B.3 |
| P2-C.5 | macOS integration: Photos import addon (PHPicker, iCloud download progress, creation date), drag-and-drop from Finder, power-save blocker during jobs, keep running after the window closes, Dock badge and completion notification, Time Machine exclusion of caches | `apps/desktop` (`native/photos`), `core/IngestService` | P2-B.1 |
| P2-D.1 | Electron packaging for macOS arm64: utility-process server, ffmpeg artifacts from P0.8, pose model files, `@electron/rebuild` for native modules, hardened runtime and entitlements, Developer ID signing of the app and every nested binary, notarization and stapling, DMG + update zip, opt-in update channel (electron-updater); installer size budget | `apps/desktop` | P2-C |
| P2-D.2 | Electron smoke tests and crash-resume tests on macOS 13 and the current macOS; Gatekeeper check on a clean machine | `apps/desktop` | P2-D.1 |

Exit gate: E2E flows 1–5 and 7–13 (6.5); dogfood gate (≥ 5 real gym sessions processed by the
team; median climb-boundary adjustment < 0.3 s; logging a day takes ≤ 30 s); desktop
performance budgets (6.4).

### 5.5 Phase 3 — Comparison and export

| ID | Work package | Modules |
| --- | --- | --- |
| P3.1 | Posture comparison: joint-angle deltas, center of mass vs. support polygon, divergence series, per-move summaries with generated text | `engine/compare` |
| P3.2 | Comparison job, API, caching by `(attemptA, attemptB, poseModel, engineVersion, optionsHash)`; pose model mismatch handling | `core`, `apps/server` |
| P3.3 | Comparison playback controller (movement-synced and real-time modes, drift correction) on climb ranges and playback proxies | `apps/web` (`src/hooks/compare`) |
| P3.4 | Compare UI: side-by-side, ghost overlay with opacity, divergence timeline, move difference panel, joint highlights; "Compare with…" suggesting the best previous attempt by proximity | `apps/web` |
| P3.5 | Alignment feedback button → label + regression case | `core`, `apps/web` |
| P3.6 | Export: skeleton overlay video, comparison video, GIF (`@napi-rs/canvas` + ffmpeg) | `core`, `adapters-node`, `apps/web` (`src/render`) |

Exit gate: E2E flow 6; real-pair alignment accuracy (6.3); comparison performance budgets;
visual snapshot tests for ghost overlay and divergence highlighting.

### 5.6 Phase 4 — Insights and learning loop

Depends on dataset v2 (≥ 300 attempts, P4.0); the Phase 4 gate cannot be decided on the ~36
test attempts of dataset v1.

| ID | Work package | Modules |
| --- | --- | --- |
| P4.0 | Dataset v2: grow to ≥ 300 labeled attempts (dogfood recordings with their committed review labels, plus new captures); refreeze the test split | `datasets/` |
| P4.1 | Feature spec v1 (frame, move, attempt features) — the only feature implementation, used for both training and inference | `engine/features` |
| P4.2 | Dataset builder: labels + engine features → JSONL + `feature_spec.json` | `core/LabelService` |
| P4.3 | `trainLogistic` and models: on/off-wall frame classifier, end-of-attempt outcome classifier, proximity and exertion models; trained in the compute pool on desktop and mobile; parity with scikit-learn on fixed data | `engine/models`, `core/ModelService` |
| P4.4 | Optional: GBDT experiment in `research/training`; adopted only if it beats logistic regression by the 6.3 margin, which then adds a TS GBDT runtime + TreeSHAP with Python parity tests | `research/training`, `engine/models` |
| P4.5 | Model registry, shadow mode, promotion and rollback, detector health panel | `core/ModelService`, `apps/web` |
| P4.6 | Insights: Stage A rules (sent vs. failed differences at the fall move, high-exertion / low-proximity flag), Stage B model-backed insights with contributions, "based on N attempts" evidence, feedback buttons | `engine/insights`, `core`, `apps/web` |
| P4.7 | Per-user boundary offset from consistent label deltas (7.1) | `engine/detect`, `core` |

Exit gate: ML targets (6.3) with confidence intervals; TS/scikit-learn parity; shadow-mode
promotion works end to end with rollback; insights never shown below their minimum-N guard.

### 5.7 Phase 5 — Mobile

| ID | Work package | Modules |
| --- | --- | --- |
| P5.1 | Spikes (gate before the full build): frame decoding + pose throughput on reference devices; lossless trim correctness of AVFoundation and Media3 on fixture videos; engine compute off the UI thread (worklet runtime vs. chunked scheduling; DTW within budget with the PCA fallback, else a native module); Drizzle + expo-sqlite migrations parity; Photos import with iCloud downloads. Extract `render` and `app-hooks` into packages. Output: ADR-003 | `apps/mobile/modules`, `adapters-native`, `packages/render`, `packages/app-hooks` |
| P5.2 | `adapters-native` and in-process `CoachApi`; conformance suite running on device through a hidden test screen | `adapters-native`, `core` |
| P5.3 | Capture screen: vision-camera (H.264, HDR off), framing guide, DeviceMotion stability indicator, exposure/focus lock, per-attempt recording prompt, direct hand-off to ingest; Photos import | `apps/mobile` |
| P5.4 | iOS feature parity: home + charts, review (touch handles, haptics, pinch-zoom), library, player with Skia overlay, rating, boulder page, comparison, trash, bundles via share sheet / Files | `apps/mobile` |
| P5.5 | Android parity and device matrix | `apps/mobile` |
| P5.6 | Release readiness: permission copy, App Store privacy labels and Play data-safety form (no data collected), opt-in crash reporting, TestFlight and Play internal track | `apps/mobile` |

Exit gate: conformance suite green on device; mobile performance budgets (6.4); pose parity
between desktop and device within tolerance (6.2); Maestro flows for record → review → cut →
rate → compare → log day, and for Photos import.

### 5.8 Phase 6 — Optional

- Sync service: the first real cloud backend (Postgres + S3-compatible object storage;
  per-row `version`, `updatedAt`, and `deletedAt` tombstones with last-writer-wins per field;
  media uploaded as content-addressed objects; Sign in with Apple / Google). The v1 schema
  already carries what sync needs.
- Coach sharing, wall-space homography overlay, live on-wall detection while recording, route
  (rope) detection.
- Other desktop platforms. Electron, the engine, and ffmpeg are cross-platform, so this is
  packaging work, not a rewrite: per-OS LGPL ffmpeg builds (Media Foundation on Windows, VAAPI
  plus an OpenH264 download on Linux), the DirectML or CPU provider for ONNX Runtime, Windows
  code signing, Linux packages, HEVC playback through proxies where Chromium cannot decode it,
  and platform replacements for the macOS integrations (Photos, power-save, Time Machine).
  Intel Macs would need an x64 or universal build and their own performance budgets.

---

## 6. Test criteria

### 6.1 Test layers

| Layer | Tool | Scope | Runs |
| --- | --- | --- | --- |
| Unit | Vitest, fast-check | `schema`, `engine`, `core` (fake ports), `render`, hooks | Every PR |
| Contract | Vitest + pytest | posebin TS ⇄ Python, label JSONL, model artifacts, JSON Schema snapshots, pose runtime parity with the Python reference | Every PR (parity: nightly) |
| API conformance | shared suite in `packages/api` | Same suite against (a) `core` in-process and (b) HTTP server; later (c) on device | Every PR (a, b); Phase 5 nightly (c) |
| Integration | Vitest + the shipped macOS ffmpeg build + fake pose | Job DAGs, video tools on fixture videos, migrations | Every PR (macOS runner) |
| E2E | Playwright (web + Electron on macOS), Maestro (mobile) | User flows in 6.5; the Photos picker is replaced by a fake in CI and checked by hand in release QA | Every PR (fake pose); nightly (real pose runtime) |
| Visual | Server-painter snapshots and Playwright screenshots in the pinned Linux container | Charts, overlays, ghost view, review timeline | Every PR |
| Eval | `coach eval` | Accuracy on the dataset (6.3), with confidence intervals | PRs touching `engine/activity\|detect\|moves\|align\|compare` or the pose adapter; nightly full |
| Performance | `coach bench`, Playwright traces, device runs | Budgets in 6.4 | Nightly; release |

### 6.2 Module-level criteria

| Module | Must be covered | Threshold |
| --- | --- | --- |
| `schema` | posebin round trip, NaN handling, Float64 timestamps, gaps outside active windows, display coordinate space, Python parity | 100% of format branches |
| `engine/activity` | Synthetic frame sequences: static scene, moving person, second person, panning camera (warning set), long idle gaps (windows exclude them) | All cases |
| `engine/pose` | One Euro filter vs. reference implementation; gap fill; normalization invariance under translation and scale (property test) | ≥ 90% lines |
| `engine/detect` | Synthetic scenarios: stand → climb → fall; sit start; top + downclimb; jump-off from top; exit through the top of the frame; already on the wall at recording start; two attempts with mat rest; walk out of frame; second person in frame; recording ends mid-climb — each with expected climb boundaries ± 1 frame | All scenarios pass |
| `engine/cut` | Properties: climb ranges never overlap after any sequence of split / merge / edit; clip ranges may overlap and are clamped to the video; `mergeDetectorUpdate` never modifies touched items; `deriveLabels` for adjusted, rejected, manual, split, and merged items | Property tests, 1000 runs |
| `engine/moves` | Synthetic placements recovered; segmentation limited to the climb range | All synthetic cases |
| `engine/align` | A vs. A → diagonal path; synthetic warps (random slow-downs and inserted rests) recovered; path monotonic and continuous; open-end prefix; PCA fallback within 1 frame of full-feature DTW on fixtures | Property tests (6.3 thresholds) |
| `engine/compare` | Identical inputs → zero divergence; injected angle offset recovered within 1° | — |
| `engine/stats` | Hand-computed rolling and EWMA ACWR fixtures; missing days; explicit rest days; DST and time-zone boundaries; prefill blend | 100% of branches |
| `engine/models` | `trainLogistic` coefficients vs. scikit-learn on fixed data (≤ 1e-4); `predict` and contributions deterministic | — |
| `engine` overall | — | ≥ 90% lines, ≥ 85% branches |
| `core/db` | Migrations from empty and from every released schema snapshot; soft delete, restore, purge (labels kept); FK behavior (purging an original keeps clips) | All migrations |
| `core` | DAG resume after a simulated crash at each step; parallel branches; import waits for a stable file size; labels derived on commit; cancel during ffmpeg and pose kills the work | ≥ 85% lines |
| `adapters-node/video` | Packet-based frame table equals decoded PTS; VFR and rotation; proxy PTS equal to original PTS; HDR fixture → SDR proxy (BT.709 transfer tags); lossless cut expands outward only and contains every requested frame (framemd5); reencode cut first/last frame equal to requested (burned-in frame number); `auto` decision; rotation preserved; corrupt and truncated files fail with `UNSUPPORTED_MEDIA` without crashing | All fixture videos |
| `adapters-node/pose` | Output on fixture clips vs. the Python reference, for both the CoreML and the CPU execution provider | mean landmark difference ≤ 0.01 (normalized coords) |
| `apps/desktop` | Power-save blocker held exactly while jobs run; quit with running jobs asks first; library on a sync folder refused; unplugged external library shows the unavailable screen; Time Machine exclusion attribute set on cache folders; Photos addon import path with a fake picker | Electron tests |
| `apps/server` | Every route through the conformance suite; 401 without token (including `/events`); 403 for wrong Host, wrong Origin, `null` Origin, stale signature; `app://-` accepted; path traversal attempts rejected; range requests; event resume with `Last-Event-ID` | 100% of routes |
| `apps/web` | Review draft undo/redo and autosave; handle math (climb vs. padding); `RatingPanel`; `TodayEntryForm` prefill / override; keyboard map; no literal strings (lint) | Component tests |
| mobile | Same pose on a fixture clip on desktop and device | mean landmark difference ≤ 0.01 (normalized coords) |

### 6.3 Accuracy targets (frozen test split, reported with 95% confidence intervals)

| Metric | Target | Phase |
| --- | --- | --- |
| Pose PCK@0.2 (torso-normalized), all frames / hard subset | ≥ 0.80 / ≥ 0.60 (initial; recalibrated by ADR-001) | 0 |
| Active-window recall (labeled attempts fully inside an active window) | ≥ 99% | 1 |
| Climb start error ≤ 0.5 s | ≥ 90% of attempts | 1 |
| Climb end error ≤ 0.5 s | ≥ 90% of attempts | 1 |
| Attempt detection recall | ≥ 95% | 1 |
| False-positive proposals | ≤ 0.2 per minute of recording | 1 |
| Fall recall; top/fall confusion | ≥ 90%; < 10% | 1 |
| Limb placement event F1 (±0.3 s) | ≥ 0.85 | 1 |
| Synthetic warp recovery (15 fps) | mean error ≤ 1 frame; ≥ 95% of frames within 2 frames | 1 |
| Real-pair move-match accuracy | ≥ 90% of labeled correspondences | 3 |
| Median user climb-boundary adjustment (dogfood) | < 0.3 s; ≥ 60% of items committed with both handles moved < 0.5 s | 2 |
| Learned detector vs. heuristic (dataset v2) | F1 improvement ≥ 3 points with paired-bootstrap p < 0.05; no metric worse by > 1 point | 4 |
| Proximity / exertion model (dataset v2) | MAE lower than the per-boulder-mean baseline, CI excluding zero difference | 4 |
| GBDT adoption (optional) | Beats logistic regression by ≥ 2 points on the primary metric, p < 0.05 | 4 |

### 6.4 Performance budgets

Reference desktop: MacBook Air M1 with 8 GB of memory (the slowest supported Mac), on battery
power and on macOS 13. Reference phones: iPhone 13, Pixel 7. Pose-dependent budgets assume the runtime and model chosen in
ADR-001 and are re-baselined there.

| Operation | Budget |
| --- | --- |
| 60 s 1080p30 single-attempt recording, desktop | proposals ≤ 45 s; review playable ≤ 60 s |
| 10-min 1080p30 recording with ≤ 30% active time, desktop | activity pass ≤ 15 s; proposals ≤ 90 s; review playable ≤ 120 s |
| HDR source, desktop | proxy ≤ 0.5 × real time |
| Lossless cut of one clip from a 5-min 1080p original | ≤ 3 s |
| Re-encode cut of a 60 s clip (hardware encoder) | ≤ 15 s |
| `pose-hq` for a 60 s clip (background) | ≤ 60 s |
| `preprocess` + `detectAttempts` on a 10-min track | ≤ 1 s |
| `align` two 60 s attempts | ≤ 300 ms desktop, ≤ 1.5 s mobile |
| Handle drag | loupe frame under the handle ≤ 50 ms; main player settles ≤ 200 ms after release; timeline at 60 fps |
| Skeleton overlay playback | ≤ 1% dropped frames at 1× |
| Homepage render with one year of logs | ≤ 300 ms after data arrives |
| CRUD API p95 | ≤ 50 ms |
| Desktop cold start to interactive home | ≤ 3 s (pose runtime loaded lazily) |
| Desktop installer (arm64 DMG) | ≤ 250 MB |
| Desktop peak memory during ingest (all processes) | ≤ 1.5 GB, so an 8 GB Mac does not swap |
| Desktop energy | no sustained thermal throttling on the fanless reference Mac during a 10-min ingest |
| Mobile: 60 s clip | proposals ≤ 120 s, no "serious" thermal state |
| Mobile: 10-min recording with ≤ 30% active time | proposals ≤ 6 min |
| Mobile peak memory during ingest | ≤ 600 MB |

Benchmarks fail CI when a result regresses by more than 10% against the stored baseline.

### 6.5 End-to-end flows

1. First run → choose library folder (default `~/Movies/Climbing Coach Library`; an iCloud
   Drive folder is refused with an explanation) → empty homepage.
2. Log today's training → all homepage charts include the day.
3. Import a recording with three attempts → proposals appear incrementally → move one climb
   start by five frames, split one merged proposal, reject a false positive, add a missed
   attempt, rate two items, pick a boulder once (later items default to it) → commit → four
   clips with ratings; labels derived with the expected kinds and deltas.
4. Rate an attempt later (proximity 4, exertion 7) → point appears on the boulder scatter;
   homepage prefill reflects the new exertion and shows its basis.
5. Re-cut an attempt from its original.
6. Compare two attempts paced differently → movement-synced playback; divergence timeline;
   flag a misaligned move → regression case stored.
7. Delete an original → it appears in the trash; clips remain; restore it; purge it → re-cut
   is disabled with an explanation.
8. Export a bundle and import it into a fresh library → identical attempts, ratings, logs,
   labels, settings.
9. Kill the app mid-ingest → relaunch → incomplete steps resume, finished ones are not redone.
10. Recording with a second person climbing nearby → "Wrong climber?" → select the right
    track → proposals update; items already edited stay as they were.
11. Import an HDR HEVC iPhone clip → SDR proxy plays; the cut clip keeps the original quality.
    An SDR HEVC clip plays directly without a clip proxy.
12. Recording where the activity pass misses an attempt → "Process whole recording" → the
    attempt is proposed.
13. Import from Photos (PHPicker) a video that is only in iCloud → download progress → ingest
    starts after the file is complete; the session date comes from the asset's creation date.
    Closing the window during ingest keeps processing; the Mac does not sleep until it ends.

### 6.6 CI gates

| Trigger | Jobs (all must pass to merge) |
| --- | --- |
| Every PR | Linux: lint, typecheck, dependency rules, unit, contract, in-process conformance, visual snapshots, web bundle size check. macOS arm64: HTTP conformance, integration with the shipped ffmpeg build, Playwright E2E in Electron with fake pose |
| PR touching activity, detection, moves, alignment, comparison, or the pose adapter | + eval on the dev split using cached posebins; metric deltas with intervals posted as a PR comment; merge blocked if any 6.3 metric drops below target or by > 1 point |
| Nightly | Full eval on the test split with the shipped pose runtime, pose parity (CPU provider on Linux, CoreML provider on macOS), benchmarks on the self-hosted reference Mac (hosted macOS runners are virtual machines and may not expose the Neural Engine or hardware video encoders), Electron packaging smoke, E2E with the real pose runtime, (Phase 5) device conformance and Maestro runs |
| Release | macOS arm64 build signed with the hardened runtime, notarized, and stapled; `spctl --assess` and `codesign --verify --deep --strict` pass on the DMG and every nested binary; installer size check; migration tests from every released schema; clean-install launch on the oldest supported macOS (13); manual gym QA checklist |

Manual gym QA checklist (per release): record two sessions on two walls with a propped phone
(one in HDR); run the whole review flow; compare two attempts; log both days; check that no
clip lost climbing at either boundary.

### 6.7 Definition of done (every PR)

- Tests added or updated at the right layer; CI green.
- Public types or API changed → `api` schemas, conformance suite, and this document updated.
- Algorithm changed → `engineVersion` bumped when outputs change; eval report attached.
- Migrations included and tested for any schema change; new user-data tables have timestamps
  and `deletedAt`.
- User-visible strings in message catalogs.
- No new outbound network calls; no new dependency with an incompatible license.

---

## 7. Feedback loops

Every loop records its signal locally in `labels` (or `insights.feedback`), has a metric, and
has a consumer that changes the product. Nothing leaves the device unless the user exports it.

### 7.1 Auto-cut boundary loop (user ⇄ detector)

- **Signal:** at commit, `deriveLabels` compares the detector's climb boundaries with the
  user's final climb boundaries (padding is excluded by construction): start/end deltas,
  false positives (rejected), false negatives (added), merged and split detections. Every
  label carries the `detectorVersion`, including any per-user offset.
- **Immediate use:** after ≥ 20 boundary labels, if the median start (or end) delta is beyond
  two frames and ≥ 70% of deltas share its sign, the detector applies that median as a per-user
  offset (bounded ± 1 s). The offset is recomputed as labels arrive and is visible in detector
  health. Padding is never auto-tuned; it is a user preference.
- **Offline use:** labels feed the on-wall/off-wall and end-of-attempt classifiers (P4.3).
- **Metrics (detector health panel, `/detector-health`):** share of items committed with both
  handles moved < 0.5 s, median |delta| start and end, false-positive and false-negative
  rates, active-window misses (reprocess with `scope: full` that finds new attempts), all per
  detector version.

### 7.2 Outcome loop

- **Signal:** auto outcome vs. confirmed outcome per attempt.
- **Use:** confusion matrix in the detector health panel; training data for the outcome
  classifier.

### 7.3 Model promotion loop (shadow mode)

1. `train-model` registers a new model as `shadow`.
2. On every new recording, the shadow model runs alongside the active one; its proposals are
   stored, not shown.
3. After ≥ 30 committed items, shadow and active are scored against the user's final climb
   boundaries.
4. Promote when the shadow wins on the primary metric and loses on none by more than 1 point;
   otherwise retire it.
5. Automatic rollback if the acceptance rate of the newly active model drops by > 10 points
   over the next 30 items.

### 7.4 Rating → insight loop

- **Signal:** proximity and exertion per attempt (often entered during review), pose
  features, outcome.
- **Use:** Stage A rules and Stage B models generate insights; each insight shows its evidence
  and N.
- **Feedback:** useful / not useful / wrong per insight. Rule types with a "not useful" rate
  above 60% over ≥ 10 ratings are suppressed for that user; "wrong" insights are saved as
  review cases for rule fixes.
- **Outcome tracking (descriptive only):** proximity trend on a boulder after an insight is
  shown, reported in diagnostics, never presented as causal.

### 7.5 Comparison alignment loop

- **Signal:** "misaligned" flags on specific moves.
- **Use:** the pair's pose tracks (no video) are added to the local alignment regression set;
  with the user's explicit export, they can be contributed to the project's regression set.
  Engine changes must not regress on it (6.6).

### 7.6 Engineering loop

- Eval reports per PR with metric deltas and confidence intervals; nightly trend file per
  metric stored as a CI artifact; benchmark baselines updated only by an explicit commit.
- Cached posebins mean engine changes are evaluated in seconds without rerunning pose models.
- Every false boundary or missed attempt found in dogfooding becomes a labeled clip in the dev
  split (never the frozen test split, which only grows at planned dataset versions).

### 7.7 Product loop

- In-app feedback with an optional diagnostics bundle (logs and versions; media only if the
  user attaches it).
- Dogfooding protocol: the team records real gym sessions every iteration, goes through the
  full flow, and files issues tagged by module.
- Homepage nudges (ACWR band, missing rest days) carry a "helpful?" toggle; nudges with
  consistently negative feedback are turned off by default.

---

## 8. Open decisions and build risks

| Decision / risk | Resolution point | Fallback |
| --- | --- | --- |
| Pose model and shipped runtime | ADR-001, end of Phase 0 | If no ONNX model is accurate enough, MediaPipe Tasks in a hidden window (CLI and CI then run through headless Electron); Python sidecar only as a last resort |
| ffmpeg build and licensing | ADR-002, Phase 0 | GPL build as a separate executable with a source offer, after legal sign-off |
| Activity pass misses an attempt | Phase 1 metric (active-window recall) | "Process whole recording" (`scope: full`); windows padded ± 3 s |
| Long keyframe intervals on some cameras make lossless cuts much longer than requested | Phase 1 fixtures | `auto` re-encodes when expansion > 2 s |
| HDR tone-mapping cost | Phase 1 benchmarks | GPU tone-mapping filters; capture defaults to SDR; proxy at 720p |
| CoreML provider does not support every operator of the chosen model, or its output drifts from the reference | ADR-001 (P0.6) | Partition check in the bake-off; CPU provider (still fast on Apple Silicon); MediaPipe Tasks |
| Hosted macOS CI runners are virtual machines that may not expose the Neural Engine or hardware video encoders | P0.1 | Functional tests use the CPU provider and `allow_sw`; budgets measured on the self-hosted reference Mac |
| Installer size, signing, notarization of nested binaries (ffmpeg, `.node` addons) | P0.8 dummy app, Phase 2-D | Sign every binary in CI with the hardened runtime; download pose models on first use; budget enforced in release CI |
| Photos addon cost or PHPicker limits | P2-C.5 | Drag-and-drop from Finder and "Export Unmodified Original" from Photos, documented in the import screen |
| Windows, Linux, and Intel Mac users cannot use the desktop app | Product decision (Revision 3) | The mobile apps (Phase 5); the desktop stack stays cross-platform so other OSes are packaging work (5.8) |
| Engine compute on mobile blocks the UI thread | P5.1 spike | Chunked scheduling; PCA-reduced DTW; native module for DTW |
| Background processing limits on iOS | P5.1 spike | Foreground processing with progress; per-attempt recordings; jobs resume on relaunch |
| Sparse labels for Phase 4 models | P4.0 | Stage A rules remain the primary insight source; models stay in shadow |
| Per-user offset hides a real detector regression | Phase 4 | Eval always runs without offsets; offsets bounded and reported in detector health |
| ACWR bands are team-sport heuristics | Phase 2-A | Shown as guidance with an explanation, never as medical advice |

---

## 9. Changelog

Revision 3 (macOS desktop):

- The desktop app targets macOS 13 or later on Apple Silicon only; Windows, Linux, and Intel
  Macs move to Phase 6 as packaging work.
- One LGPL ffmpeg build for macOS arm64 with VideoToolbox (hardware, or Apple's software
  encoder with `allow_sw`); the OpenH264 download and per-OS builds are gone.
- ONNX Runtime uses the CoreML execution provider on macOS, the same acceleration path as iOS.
- HEVC SDR clips play directly; HDR clips still get an SDR proxy.
- Electron is kept over Tauri and SwiftUI: the backend stays in Node next to the engine.
- Packaging is a DMG plus update zip with hardened runtime, Developer ID signing of every
  nested binary, notarization, and stapling.
- New macOS integrations: Photos import (PHPicker addon), power-save blocker during jobs,
  running after the window closes, Dock badge and notifications, Time Machine exclusion of
  caches, refusal of sync folders as the library root, privacy-prompt and unplugged-drive
  handling, macOS menus and shortcuts.
- CI splits into Linux runners (pure TS) and macOS arm64 runners (binaries, Electron,
  notarization), with a self-hosted reference Mac (MacBook Air M1, 8 GB) for benchmarks;
  new memory and thermal budgets; new E2E flow 13 (Photos import).

Revision 2 (plan review applied):

- Review handles now mark the climb (first frame on the wall, fall/top frame); padding is
  applied only at cut time. Attempts store the climb range inside the clip, and alignment,
  moves, and comparison use it. Labels are deltas of climb boundaries, and the dogfood metric
  measures detector accuracy. Padding auto-tune replaced by a bounded per-user boundary offset.
- Overlap is checked on climb ranges; padded clips may share frames.
- Ingest is a DAG: a cheap keyframe activity pass finds active windows, pose runs only there
  (decoded once and downscaled by ffmpeg), and the proxy is built in parallel. Committed clips
  get a 30 fps HQ pose track in the background.
- No Python in the shipped app: ADR-001 chooses the pose model and runtime (ONNX Runtime
  preferred, MediaPipe Tasks as alternative); logistic regression is trained in TS on both
  platforms; GBDT only if it measurably wins.
- Smart cut dropped: lossless (keyframe-expanded) by default, full hardware re-encode when
  needed.
- Review API simplified to a client-side draft (`GET` / `PUT` / `commit`) with undo/redo;
  ratings, boulder defaults, and quick-create happen during review.
- Fixed auth details: fetch-based SSE with the auth header, renderer served from `app://-`,
  session-lifetime signed media URLs.
- Added: pre-rendered loupes, clip proxies, HDR/HEVC handling and SDR capture defaults,
  display coordinate space, exit-at-top outcome, floor fallbacks, camera-motion warning,
  climber track picker, detector updates never touch edited items, recompute after engine
  upgrades, pose-model consistency for comparisons, soft delete and trash with tombstones,
  session-based day assignment, discipline flag, Photos import, packet-based probing, quick
  hashing, fuller bundles, daily DB backups, Lingui, signing and installer budget, ffmpeg ADR,
  EWMA option, session exertion prefill blend, dataset v2 and confidence intervals for the
  Phase 4 gate, and new tests (path traversal, corrupt files, unstable files, SSE auth,
  cancellation).
- Fewer packages until mobile: `db` lives in `core`; `render`, hooks, and UI live in
  `apps/web` and are extracted in P5.1.
