# Climbing Coach App — Code Building Plan

This document turns the product plan in [`PLAN.md`](./PLAN.md) into an engineering plan: the
technical stack, code modules, architecture, API, development phases, test criteria, and
feedback loops. `PLAN.md` says *what* the app does and *why*; this document says *how it is
built* and *how we know each part works*. Section references like "PLAN 2.4" point to the
product plan.

Contents

1. [Technical stack](#1-technical-stack)
2. [Repository and code modules](#2-repository-and-code-modules)
3. [System architecture](#3-system-architecture)
4. [API details](#4-api-details)
5. [Development phases](#5-development-phases)
6. [Test criteria](#6-test-criteria)
7. [Feedback loops](#7-feedback-loops)
8. [Open decisions and build risks](#8-open-decisions-and-build-risks)

---

## 1. Technical stack

### 1.1 Choices

| Area | Choice | Why | Alternative kept open |
| --- | --- | --- | --- |
| Language (app) | TypeScript (strict) everywhere except ML | One language for engine, services, desktop UI, and mobile UI | — |
| Language (ML) | Python 3.11+ | Pose models and training libraries live here | ONNX Runtime in Node if RTMPose wins the bake-off (removes Python from the shipped desktop app) |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, task caching, works with Expo | Nx |
| Runtime validation | Zod; JSON Schema exported for Python | Same schema validates API, files, and forms | — |
| Local backend | Node.js (current LTS) + Fastify | Runs the TS engine natively; HTTP range requests for video | — |
| Database | SQLite via Drizzle ORM (better-sqlite3 on desktop, expo-sqlite on mobile) | One schema and one set of migrations for both platforms | op-sqlite on mobile if expo-sqlite is too slow |
| Jobs | In-process job queue persisted in SQLite | Survives restarts, no extra service | — |
| Video tools | ffmpeg / ffprobe (static builds) | Probe, proxy, lossless cut, thumbnails, export | — |
| Pose (desktop) | `ml-worker` Python sidecar: MediaPipe Pose Landmarker, RTMPose via `rtmlib` + ONNX Runtime | Covers all bake-off candidates with one adapter | YOLOv8-pose is research-only (AGPL-3.0 license) |
| ML training | scikit-learn, LightGBM, SHAP in `ml-worker` | Small tabular models; exported to JSON and evaluated in TS | ONNX if a neural model is introduced |
| Desktop shell | Electron (renderer + utility process) | Consistent Chromium video stack (`requestVideoFrameCallback`, H.264/HEVC) on all OSes, and it runs the Node backend without a separate sidecar | Tauri with a Node SEA sidecar (WebKitGTK video support on Linux is the blocker) |
| Web UI | React, Vite, TanStack Router, TanStack Query, Zustand, React Hook Form | Server state, UI state, and forms each get one tool | — |
| Web styling | Tailwind CSS + Radix UI primitives | Accessible primitives, shared design tokens | — |
| Web charts | Recharts | Covers bar, line, scatter, stacked bar | visx for custom charts |
| Overlay rendering | Canvas 2D (web), react-native-skia (mobile), `@napi-rs/canvas` (server-side export) | All three consume the same draw commands from `packages/render` | — |
| Mobile | Expo (dev client / prebuild), React Native, react-native-vision-camera, expo-file-system, Expo Modules (Swift/Kotlin) | Shared hooks and core services; native modules for pose and cutting | Flutter (would mean rewriting the engine in Dart) |
| Mobile charts | victory-native (Skia) | Same series data as the web charts | — |
| Mobile cutting | AVFoundation (iOS), Media3 Transformer (Android) | Native lossless trim | — |
| Unit / integration tests | Vitest, fast-check (property tests), Testing Library | — | — |
| E2E tests | Playwright (web + Electron), Maestro (mobile) | — | Detox |
| Python tests / lint | pytest, ruff, pyright | — | — |
| TS lint / format | ESLint (typescript-eslint), Prettier, dependency-cruiser for module boundaries | — | Biome |
| CI | GitHub Actions | — | — |
| Versioning | Changesets (packages), semver for `engine` and model artifacts | Derived data records the version that produced it | — |
| Logging | pino (JSON, rotated files in the library folder) | Local diagnostics without telemetry | Sentry, opt-in only |

### 1.2 Licensing constraints

- MediaPipe (Apache-2.0), RTMPose / MMPose (Apache-2.0), and ONNX Runtime (MIT) are safe to
  ship.
- ffmpeg is shipped as an LGPL build. libx264 (GPL) is not included: proxies and exports use
  platform encoders (VideoToolbox on macOS, Media Foundation on Windows) or OpenH264 on Linux.
- Ultralytics YOLO is AGPL-3.0: allowed in `research/` for the bake-off, never in shipped
  artifacts unless a commercial license is bought.

---

## 2. Repository and code modules

### 2.1 Layout

```
climbing-coach/
  apps/
    desktop/            Electron main + preload, packaging (electron-builder), sidecar management
    web/                React renderer (Vite); runs inside Electron or in a browser in dev mode
    server/             Fastify local API server (runs in the Electron utility process)
    cli/                `coach` CLI: process, cut, align, eval, bench
    mobile/             Expo app (Phase 5)
      modules/pose/     Expo module: MediaPipe Tasks / ONNX Runtime Mobile → posebin
      modules/cutter/   Expo module: AVFoundation / Media3 Transformer
  packages/
    schema/             Domain types, time units, IDs, posebin format, label formats, feature spec
    engine/             Pure algorithms (no I/O): pose, detect, cut, moves, align, compare,
                        stats, grades, features, insights, models
    api/                Resource DTOs, request/response schemas, route table, `CoachApi`
                        interface, HTTP client, problem codes, API conformance test suite
    core/               Application services implementing `CoachApi`, ports, job pipelines,
                        label recording
    db/                 Drizzle schema, migrations, repositories (driver-agnostic)
    adapters-node/      better-sqlite3 driver, fs file store, ffmpeg video tools, ml-worker
                        client, worker_threads compute pool, signed media URLs
    adapters-native/    expo-sqlite driver, expo-file-system store, native module bindings,
                        background compute (Phase 5)
    render/             Overlay draw-command generation (skeleton, trail, ghost, highlights)
    app-hooks/          TanStack Query hooks, view models, player clock, comparison sync
                        controller — shared by web and mobile
    ui-web/             Web design system, timeline primitives, chart wrappers
    test-fixtures/      Synthetic climber generator, fixture-video generator, fake ports,
                        golden files
    config/             Shared tsconfig, ESLint, Prettier, Vitest presets
  workers/
    ml-worker/          Python: extract_pose, train; stdio JSON-lines protocol; PyInstaller spec
  research/
    label-tool/         Minimal temporal labeling page (Phase 0)
    harness/            Dataset tooling, bake-off, eval reports
    notebooks/
  datasets/             manifest.json + label JSONL (media lives in private storage, not git)
  docs/
    PLAN.md  BUILD_PLAN.md  adr/  capture-protocol.md
```

### 2.2 Module responsibilities

| Module | Owns | Must not |
| --- | --- | --- |
| `schema` | Types and Zod schemas for time (`Us`), IDs (ULID), `PoseTrack`, posebin reader/writer, label records, feature spec | Depend on anything but Zod |
| `engine` | Every algorithm in PLAN 2.1–2.9 and 2.11 as pure functions over typed arrays | Do I/O, use Node or DOM globals, read clocks, or generate IDs |
| `api` | The public contract: DTOs, routes, `CoachApi`, HTTP client, error codes, conformance suite | Contain business logic |
| `core` | Use cases (import, review, commit, rate, compare, log training, insights, models), transactions, job pipelines, label recording | Know about HTTP, Electron, React, or a specific database driver |
| `db` | Tables, migrations, repository implementations of `core` ports | Contain business rules |
| `adapters-node` | Desktop implementations of ports | Be imported by `core` or `engine` |
| `adapters-native` | Mobile implementations of ports | Be imported by `core` or `engine` |
| `render` | Pose → draw commands (lines, circles, labels, colors) for any painter | Touch a canvas directly |
| `app-hooks` | Query hooks, optimistic updates, SSE invalidation, player clock, comparison playback controller | Render platform UI |
| `ui-web` | Web components and styling | Fetch data |
| `apps/server` | Route registration, auth, media serving, SSE, wiring ports → `core` | Contain business logic |
| `apps/web` | Pages, feature components | Call `fetch` directly (always via `app-hooks`) |
| `workers/ml-worker` | Pose inference, tracking, model training | Compute ML features (features always come from `engine/features`) |

### 2.3 Dependency rules (enforced by dependency-cruiser in CI)

| Module | May depend on |
| --- | --- |
| `schema` | — |
| `engine` | `schema` |
| `api` | `schema` |
| `core` | `schema`, `engine`, `api` |
| `db`, `adapters-node`, `adapters-native` | `schema`, `core` (ports) |
| `render` | `schema`, `engine` (types only) |
| `app-hooks` | `schema`, `api`, `render` |
| `ui-web` | `render` |
| `apps/server`, `apps/cli` | `core`, `db`, `adapters-node`, `api`, `engine` |
| `apps/web` | `app-hooks`, `ui-web`, `api` (types and HTTP client) |
| `apps/desktop` | Nothing at runtime except starting `apps/server` and loading `apps/web` |
| `apps/mobile` | `core`, `db`, `adapters-native`, `app-hooks`, `render`, `api` |

Additional rules: `engine` is checked by a lint rule that bans `fs`, `path`, `process`,
`window`, `document`, `Date.now`, and `Math.random`; its tests run under both Node and a
browser-like environment.

### 2.4 `engine` submodules

| Submodule | Key exports | PLAN ref |
| --- | --- | --- |
| `pose` | `preprocess`, `selectClimberTrack`, `oneEuroFilter`, `fillGaps`, `normalize`, `bodyMetrics` | 2.1 |
| `features` | `frameFeatures`, `attemptFeatures`, `moveFeatures`, `FEATURE_SPEC` (versioned names and order) | 2.1, 2.9 |
| `detect` | `estimateFloor`, `detectStarts`, `detectEnds`, `classifyOutcome`, `detectAttempts`, `detectorSignals` | 2.2, 2.3 |
| `cut` | `proposeCuts`, `splitProposal`, `mergeProposals`, `clampRange`, `validateProposals` | 2.4 |
| `moves` | `segmentMoves`, `stationaryPeriods`, `fallMoveIndex` | 2.5 |
| `align` | `matchMoves` (Needleman–Wunsch), `collapseRests`, `bandedDtw`, `openEndDtw`, `align` | 2.7 |
| `compare` | `jointAngleDeltas`, `comSupportOffset`, `divergenceSeries`, `summarizeByMove` | 2.8 |
| `stats` | `trainingLoad`, `rollingAverages`, `acwr`, `exertionVolume`, `focusDistribution`, `gradePyramid`, `weeklySummary`, `prefillTrainingLog` | 2.11 |
| `grades` | Grade systems (V, Font, YDS, French), `toDifficultyIndex`, `formatGrade` | 2.10, 2.11 |
| `insights` | Rule engine (`evaluateRules`), rule definitions with evidence and minimum-N guards | 2.9 Stage A |
| `models` | `predict` for logistic regression and GBDT JSON artifacts, `treeShap`, `linearContributions` | 2.9 Stage B |

Starting detector parameters (all tuned on the dev split in Phase 1, stored in a versioned
`params.ts`):

| Parameter | Start value |
| --- | --- |
| Pose sample rate | 15 fps (30 fps for clips shorter than 30 s) |
| Ankle lift for "on wall" | > 0.15 × body height above floor |
| Hip stillness to confirm start | vertical speed < 0.3 body heights/s for ≥ 0.5 s |
| Fall threshold | downward hip speed > 1.5 body heights/s |
| Top dwell | both wrists stationary at max height ≥ 0.7 s |
| Stationary limb | speed < 0.15 torso lengths/s for ≥ 0.25 s |
| Rest collapse | speed < 0.1 torso lengths/s for > 1 s → keep 3 representative frames |
| Walk-out gap merge | out of frame < 3 s → same attempt |
| DTW band | 20% of the longer matched segment |

---

## 3. System architecture

### 3.1 Runtime overview

Desktop:

```
┌───────────────────────────── Electron app ─────────────────────────────┐
│ Main process: windows, menus, file dialogs, opt-in auto-update          │
│   starts the utility process, passes {port, token} to the preload       │
│                                                                        │
│ Renderer (apps/web)                 Utility process (apps/server)       │
│  React UI ── HTTP + SSE ─────────►  Fastify  /api/v1  (127.0.0.1 only)  │
│  <video> ── signed media URLs ───►  core services                      │
│                                      job runner ─┬─ worker_threads (engine)
│                                                  ├─ ffmpeg / ffprobe
│                                                  └─ ml-worker (Python, stdio JSONL)
│                                      SQLite library.db · file store     │
└────────────────────────────────────────────────────────────────────────┘
```

Mobile:

```
┌──────────────────────────── Expo app (Hermes) ──────────────────────────┐
│ React Native UI (apps/mobile) → app-hooks → CoachApi (in-process)       │
│   → core services → engine (JS, run off the UI thread)                  │
│   → adapters-native: expo-sqlite + Drizzle, expo-file-system,           │
│       PoseModule (Swift/Kotlin, background thread),                     │
│       CutterModule (AVFoundation / Media3 Transformer)                  │
│   → job runner (JS, persisted in SQLite; heavy work in native threads)  │
└────────────────────────────────────────────────────────────────────────┘
```

Why the desktop renderer talks HTTP to a local server instead of Electron IPC:

- `<video>` gets HTTP range requests for free, which frame-accurate scrubbing needs.
- The web UI runs in a normal browser during development with hot reload.
- Playwright, the CLI, and the conformance suite all hit the same API.
- `core` exposes one `CoachApi`; desktop wraps it in HTTP, mobile calls it in-process. Both are
  verified by the same conformance suite (6.2).

### 3.2 Backend architecture (desktop local server)

#### Layers

```
HTTP routes (apps/server)     auth · validation (Zod) · problem+json · media · SSE
        │
Application services (core)   use cases, transactions, job enqueueing, label recording
        │
Domain (engine)               pure algorithms
        │
Ports (core/ports)            Repositories · FileStore · PoseExtractor · VideoTools ·
        │                     ComputePool · JobQueue · ModelTrainer · Clock · IdGen · Logger
Adapters                      db + adapters-node (desktop) / adapters-native (mobile)
```

#### Application services (`core`)

| Service | Responsibilities |
| --- | --- |
| `IngestService` | Import a recording (copy / move / reference), dedupe by SHA-256, enqueue the ingest pipeline |
| `ReviewService` | List, add, update, split, merge, reject proposals; commit selected proposals; enforce no-overlap |
| `AttemptService` | Query attempts, update ratings / outcome / fall move / tags / notes, re-cut, export |
| `BoulderService`, `GymService`, `SessionService` | CRUD, boulder stats and progress series |
| `ComparisonService` | Create or reuse a comparison, serve results, record alignment feedback |
| `TrainingLogService` | Upsert / delete daily entries, compute prefill from that day's attempts |
| `StatsService` | Training load, ACWR, exertion vs. volume, focus distribution, grade pyramid, weekly summary |
| `InsightService` | Run rules and models for a boulder, store insights, record insight feedback |
| `ModelService` | Registry, training jobs, shadow evaluation, promote / rollback |
| `LabelService` | Write labels on commit / reject / confirm / feedback; export datasets |
| `BundleService` | Export / import zip bundles (DB rows + files) |
| `SettingsService`, `JobService`, `DiagnosticsService` | Settings, job control, diagnostics export (logs and versions, no media) |

Every mutation runs in one DB transaction. Files are written to a temp path and atomically
renamed before the transaction that references them commits; a periodic `gc-files` job deletes
orphans.

#### Job system

- `jobs` table: `id, type, status (queued|running|succeeded|failed|cancelled), step, progress,
  payload, result, error, attempt, createdAt, startedAt, finishedAt`.
- Pipelines are lists of named, idempotent steps. Each step writes its artifact and records
  completion, so a crash or restart resumes at the first incomplete step.
- Concurrency: one pose job at a time (CPU/GPU heavy), two ffmpeg jobs, compute pool size =
  CPU cores − 1. Retries: up to 3 with exponential backoff for transient failures (sidecar
  crash, disk busy); validation failures are not retried.
- Cancellation: `AbortSignal` propagated to child processes (SIGTERM, then SIGKILL after 5 s).

Pipelines:

| Pipeline | Steps |
| --- | --- |
| `ingest` | `hash` → `probe` (codec, rotation, VFR, frame table, keyframes) → `proxy` (720p H.264, 0.5 s GOP, timestamps passed through) → `filmstrip` (1 tile/s sprite) → `pose` (ml-worker, emits chunks) → `preprocess` → `detect` → `propose` |
| `commit-cuts` | per proposal: `cut` → `probe-clip` → `thumbnail` → `slice-pose` (re-based to clip time) → `segment-moves` → `create-attempt` + write labels |
| `recut` | same as `commit-cuts` for one attempt, from the original |
| `compare` | `load-tracks` → `align` → `compare` → `write-result` |
| `export` | `render-overlay` (`@napi-rs/canvas` frames) → `ffmpeg-compose` |
| `train-model` | `build-dataset` (engine features) → `ml-worker train` → `evaluate` → `register` (status `shadow`) |
| `bundle-export` / `bundle-import` | `collect` → `zip` / `unzip` → `verify` → `insert` |
| `cleanup-originals` | find originals past retention → prompt via event (never deletes silently) |

Incremental proposals for long recordings: `ml-worker` reports `chunk` events every 30 s of
video; `detect` runs on the accumulated track and finalizes proposals that end more than 10 s
before the processed frontier, emitting `proposals.updated` each time.

#### Storage layout

```
<libraryRoot>/
  library.db                    SQLite (WAL mode)
  originals/<yyyy>/<mm>/<id>.<ext>
  clips/<id>.mp4
  proxies/<videoId>.mp4
  pose/<videoId>.posebin
  thumbs/<videoId>/poster.jpg, filmstrip-<n>.jpg
  comparisons/<id>.bin
  models/<kind>/<version>.json
  exports/  backups/  logs/
```

The library root is chosen on first run. The DB is copied to `backups/` before every migration.

#### Data model (Drizzle tables)

| Table | Key columns |
| --- | --- |
| `climbers` | `id, name, heightCm, gradeSystem` (one row in v1; kept for sync) |
| `gyms` | `id, name, notes` |
| `boulders` | `id, gymId, name, grade, difficultyIndex, color, setOn, retiredOn, wallPhotoPath, version` |
| `sessions` | `id, gymId, date, startedAt, endedAt` |
| `videos` | `id, kind (original\|clip), path, proxyPath, sha256, durationUs, width, height, rotation, codec, fpsNominal, isVfr, recordedAt, sourceVideoId, sourceStartUs, sourceEndUs, deletedAt` |
| `pose_tracks` | `id, videoId, model, modelVersion, sampleFps, path, selectedTrackId` |
| `cut_proposals` | `id, videoId, detectorVersion, origin (detector\|manual\|split\|merge), detectedStartUs, detectedEndUs, detectedOutcome, confidence, startUs, endUs, prePadUs, postPadUs, outcome, boulderId, status (pending\|rejected\|committed), attemptId, version` |
| `attempts` | `id, clipVideoId, sessionId, boulderId, outcome (fall\|drop\|top\|unknown), outcomeSource (auto\|confirmed), fallMoveIndex, proximity (1–5), exertion (1–10), notes, ratedAt, version` |
| `tags`, `attempt_tags` | structured tags (balanced, powerful, pumped, beta change, custom) |
| `move_segments` | `id, attemptId, index, limb (lh\|rh\|lf\|rf), startUs, endUs, holdX, holdY` |
| `comparisons` | `id, attemptAId, attemptBId, engineVersion, optionsHash, resultPath, summary (JSON)` |
| `training_logs` | `date (PK, YYYY-MM-DD local), tzOffsetMin, sessionExertion, exertionSource (prefill\|user), boulderCount, routeCount, durationMin, sessionType, primaryFocusId, body (JSON), notes, load (derived), version` |
| `training_log_focus`, `focus_tags` | secondary focus tags, built-in + custom |
| `training_log_grades` | `date, discipline (boulder\|route), grade, attempted, sent` |
| `labels` | `id, kind, subjectId, predicted (JSON), final (JSON), deltaStartUs, deltaEndUs, sourceVersion, createdAt` |
| `insights` | `id, boulderId, attemptId, kind, text, evidence (JSON), sourceVersion, feedback, createdAt` |
| `models` | `id, kind, version, path, featureSpecVersion, metrics (JSON), status (shadow\|active\|retired), datasetHash, trainedAt` |
| `jobs`, `settings` | see job system; key/value settings |

Indexes: `attempts(boulderId, createdAt)`, `attempts(sessionId)`, `cut_proposals(videoId,
status)`, `labels(kind, createdAt)`, `jobs(status, createdAt)`, `videos(sha256)`.

Deleting an original sets `videos.deletedAt` and removes the file; clips and attempts are kept
(`sourceVideoId` stays for history; re-cut then returns 410).

#### Security (local server)

- Bound to `127.0.0.1` on a random free port.
- Every API request needs `Authorization: Bearer <launchToken>` (generated per launch, passed
  to the renderer through the preload `contextBridge`).
- `Host` must be `127.0.0.1:<port>` or `localhost:<port>` and `Origin` must be the app origin
  (blocks DNS rebinding and other local web pages).
- `<video>` and `<img>` cannot send headers, so media is served through signed URLs
  (`?exp=<unix>&sig=<HMAC-SHA256>`, 1-hour expiry) embedded in DTOs.
- File serving is restricted to the library root (path traversal guard), Electron runs with
  `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP.
- No outbound network calls except the opt-in update check.

### 3.3 Frontend architecture

#### Web routes (`apps/web`, TanStack Router)

| Route | Page | Main components |
| --- | --- | --- |
| `/` | Home: training log and graphs | `TodayEntryForm`, `WeeklySummaryStrip`, `TrainingLoadChart` + `AcwrIndicator`, `ExertionVolumeScatter`, `FocusDistributionChart`, `GradePyramid`, `RecentSessionsStrip` |
| `/library` | Attempts grid | `AttemptFilters`, `AttemptGrid`, `AttemptCard` |
| `/recordings` | Originals with derived clips | `RecordingList`, `ProcessingStatus`, `RecutAction` |
| `/recordings/:id/review` | Auto-cut review | see component tree below |
| `/attempts/:id` | Player + rating | `AttemptPlayer`, `OverlayModeToggle`, `MoveList`, `RatingPanel` (`ProximityScale`, `ExertionScale`, outcome, fall-move picker, tags, notes), `CompareWithButton` |
| `/boulders/:id` | Boulder history | `BoulderHeader`, `AttemptHistoryTable`, `ProximityExertionScatter`, `InsightsPanel` |
| `/compare?a=&b=` | Comparison | `DualPlayer`, `GhostOverlay`, `SyncModeToggle`, `DivergenceTimeline`, `MoveDifferencePanel`, `AlignmentFeedbackButton` |
| `/settings` | Settings | padding, retention, pose model, sample fps, grade system, library root |
| `/diagnostics` | Detector health, models, jobs, logs | `DetectorHealthPanel`, `ModelRegistryTable`, `JobList` |

Review screen component tree:

```
ReviewPage
 ├─ VideoPlayer (proxy stream, frame clock)
 │   └─ SkeletonOverlay (toggle)
 ├─ ProposalTimeline
 │   ├─ FilmstripTrack (sprite tiles)
 │   ├─ ActivityTrack (detector signals: on-wall score, hip speed)
 │   └─ ProposalRange × n (drag handles; context menu: split / merge / reject)
 ├─ HandleLoupe (frame-by-frame strip ±1 s around the active handle)
 ├─ ProposalList (outcome select, boulder picker, status)
 └─ CommitBar (cut mode, commit selected)
```

Review keyboard map: Space play/pause, ←/→ one frame, Shift+←/→ 0.5 s, `I`/`O` set start/end of
the active proposal at the playhead, `S` split at playhead, `Delete` reject, `Tab` next
proposal, `Enter` commit selected.

#### State management rules

- Server state lives only in TanStack Query (keys per resource; SSE events invalidate keys).
- Ephemeral UI state lives in Zustand stores: `playerStore` (current time, playing, rate),
  `reviewStore` (active proposal, drag state), `compareStore` (sync mode, overlay opacity).
- Drags update local state only; one `PATCH` is sent on drag end. Ratings and proposal edits
  are optimistic with rollback on error.
- Forms use React Hook Form with resolvers built from `api` Zod schemas, so client and server
  validation are identical.

#### Video timing (frame accuracy)

- Media time is integer microseconds from stream start (`Us`). The server provides the frame
  timestamp table per video (from ffprobe), so frame stepping is "seek to the next PTS", not
  "add 1/fps" (phones record variable frame rate).
- Seek target is `pts + 0.5 frame` to avoid landing on the previous frame;
  `requestVideoFrameCallback` `mediaTime` tells the overlay which frame is on screen.
- The review proxy is encoded with timestamps passed through, so a boundary picked on the
  proxy is exactly the same instant in the original.

#### Comparison playback controller (`app-hooks/compare`)

- Two modes: *movement-synced* (default) and *real time*.
- Movement-synced walks the warp path: A is the master clock; B's target time is looked up
  from the path; B's `playbackRate` is set from the local slope of the path (clamped
  0.25×–4×), and B is hard-seeked when drift exceeds one frame. In collapsed rest regions one
  video holds on its frame while the other plays through its rest.
- Unmatched segments ("no counterpart") show a dimmed panel with a label.

#### Rendering (`packages/render`)

`renderPose(frame, options) → DrawCommand[]` and `renderGhost(a, b, divergence, options)`
produce painter-agnostic commands; `ui-web` paints them on Canvas 2D, mobile with Skia, the
server with `@napi-rs/canvas` for exports. Visual snapshot tests run on the server painter.

#### Mobile frontend (`apps/mobile`)

- Navigation (Expo Router): tabs Home / Library / Record / Boulders; stacks for review,
  attempt, compare.
- Same `app-hooks` and `CoachApi` interface; the in-process implementation replaces HTTP.
- Platform-specific views: touch handles with haptic ticks per frame, pinch-zoom timeline,
  Skia overlays, victory-native charts, share sheet for bundles.
- Capture screen: vision-camera at 1080p30 by default, framing guide, stability indicator,
  optional exposure/focus lock; a finished recording goes straight into `ingest`.

### 3.4 Data formats

- **IDs:** ULID strings, generated by `core` on either platform (sortable, safe for later sync).
- **Time:** media time `Us` (integer microseconds); wall-clock ISO 8601 UTC (`*At`); calendar
  days `YYYY-MM-DD` in the climber's local time with `tzOffsetMin`. Sessions crossing midnight
  belong to the day they started.
- **Skeleton topology:** canonical 33-point BlazePose layout. Models with other layouts are
  mapped into it; unmapped points are `NaN`. The engine only depends on 17 core points
  (nose, shoulders, elbows, wrists, hips, knees, ankles, heels, foot index).
- **posebin** (pose track file):

  ```
  offset   size      field
  0        8         magic "POSEBIN\0"
  8        4         uint32 format version (1)
  12       4         uint32 header length H
  16       H         UTF-8 JSON header (PoseTrackHeader)
  …        pad to 8-byte alignment
  …        8 × N     Float64 tUs[N]               sampled frame timestamps (N = frameCount)
  …        per track k: Float32 [N_k × 33 × 4]  x, y (normalized image coords), z, visibility; NaN = missing
  ```

  `Float64` timestamps are deliberate: `Float32` loses microsecond precision after ~16 s.

- **Comparison result** (`comparisons/<id>.bin`): Int32 warp path pairs `[L × 2]` (frame index
  in A, frame index in B) + Float32 divergence `[L × J]` (8 joint angles + 2 composite metrics);
  summary JSON in the DB.
- **Model artifact** (`models/<kind>/<version>.json`): `{ kind, version, algo: "logreg" |
  "gbdt", featureSpecVersion, classes?, standardization, coefficients? | trees?, metrics,
  trainedOn: { datasetHash, n } }`.
- **Labels export:** JSONL rows `{ subjectId, kind, features: number[], featureSpecVersion,
  target, sourceVersion }` plus `feature_spec.json`.

---

## 4. API details

### 4.1 Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `http://127.0.0.1:{port}/api/v1` |
| Auth | `Authorization: Bearer {launchToken}`; media through signed URLs |
| Format | JSON, camelCase; binary endpoints return `application/octet-stream` |
| Time | `*Us` integer microseconds (media), `*At` ISO 8601 UTC, dates `YYYY-MM-DD` |
| Pagination | `?limit=50&cursor=…` (max 200) → `{ items, nextCursor }` |
| Concurrency | Mutable resources carry `version`; `PATCH`/`PUT` accept `expectedVersion` → 409 on mismatch |
| Long operations | `202 Accepted` with `{ jobId, … }`; progress through SSE `/events` or `GET /jobs/:id` |
| Errors | `application/problem+json` (4.5) |
| Versioning | Path version `/v1`; additive changes only within v1; `schemaVersion` in `/health` |

### 4.2 Endpoint reference

System

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | App, engine, schema, ffmpeg, and ml-worker versions and status |
| GET | `/events` | SSE stream (4.4) |
| GET / PATCH | `/settings` | Padding, retention, pose model, sample fps, grade system |
| POST | `/feedback` | `{ category, message, includeDiagnostics }` |
| POST | `/diagnostics/export` | 202 → zip of logs and versions (no media) |

Gyms, boulders, sessions

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/gyms` | List / create |
| PATCH / DELETE | `/gyms/:id` | Update / delete |
| GET / POST | `/boulders` | Filters `gymId, active, gradeMin, gradeMax, q` |
| GET / PATCH / DELETE | `/boulders/:id` | `GET` includes `stats { attempts, sends, bestProximity, lastAttemptAt }` |
| GET | `/boulders/:id/progress` | Proximity-vs-exertion points, one per attempt, with session id |
| GET | `/boulders/:id/insights` | Insights for this boulder |
| GET / POST | `/sessions` | Filters `from, to, gymId` |
| GET / PATCH | `/sessions/:id` | Session with its attempts |

Recordings and auto-cut review

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/recordings` | Import by path `{ sourcePath, importMode: copy\|move\|reference, sessionId? }` → 202 |
| POST | `/recordings/upload` | Multipart upload (browser dev mode only) → 202 |
| GET | `/recordings` | List with processing status and clip counts |
| GET | `/recordings/:id` | Metadata, processing state, derived clips, media URLs |
| DELETE | `/recordings/:id` | Delete the original file; clips remain |
| POST | `/recordings/:id/reprocess` | Rerun detection with the current detector (reuses pose if the model is unchanged) → 202 |
| GET | `/recordings/:id/filmstrip` | `?startUs&endUs&count&width` → `{ spriteUrl, tiles: [{ tUs, x, y, w, h }] }` |
| GET | `/recordings/:id/signals` | Downsampled detector signals for the activity track |
| GET | `/recordings/:id/proposals` | Proposals + `processing { complete, processedUntilUs }` |
| POST | `/recordings/:id/proposals` | Add a manual range |
| PATCH | `/proposals/:id` | `{ range?, outcome?, boulderId?, expectedVersion? }` |
| POST | `/proposals/:id/split` | `{ atUs }` → two proposals |
| POST | `/proposals/merge` | `{ ids }` → one proposal (must be adjacent) |
| POST | `/proposals/:id/reject` | Reject (recorded as a false-positive label) |
| POST | `/proposals/:id/restore` | Undo a reject before commit |
| POST | `/recordings/:id/proposals/commit` | `{ proposalIds, cutMode: lossless\|exact\|auto }` → 202 |

Media and pose

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/media/videos/:videoId?variant=original\|proxy&exp&sig` | Video stream with range requests |
| GET | `/media/thumbs/:videoId/:name?exp&sig` | Poster and filmstrip sprites |
| GET | `/videos/:id/frames` | Frame timestamp table (Float64 binary) |
| GET | `/videos/:id/pose?fromUs&toUs` | posebin slice |

Attempts and tags

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/attempts` | Filters `boulderId, sessionId, recordingId, outcome, from, to, proximityMin/Max, exertionMin/Max, tag, rated`; `sort` |
| GET / PATCH / DELETE | `/attempts/:id` | `PATCH { proximity?, exertion?, outcome?, fallMoveIndex?, boulderId?, tags?, notes?, expectedVersion? }` |
| GET | `/attempts/:id/moves` | Move segments |
| POST | `/attempts/:id/recut` | `{ range, cutMode }` → 202; 410 if the original is deleted |
| POST | `/attempts/:id/export` | `{ overlay: none\|skeleton\|trail, format: mp4\|gif }` → 202 |
| GET / POST | `/tags` | List / create custom tags |

Comparisons

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/comparisons` | `{ attemptAId, attemptBId, options { collapseRests, spatialMode } }` → 200 if cached, else 202 |
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
| GET | `/stats/training-load?from&to` | Daily load, 7-day and 28-day averages, ACWR, band |
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

Jobs and bundles

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/jobs?status&type` | List |
| GET | `/jobs/:id` | Status, step, progress, error |
| POST | `/jobs/:id/cancel` | Cancel |
| POST | `/jobs/:id/retry` | Retry a failed job from its last incomplete step |
| POST | `/bundles/export` | `{ scope { boulderIds?, from?, to? }, includeOriginals }` → 202 |
| POST | `/bundles/import` | `{ path }` → 202 |

### 4.3 Example payloads

Import a recording:

```http
POST /api/v1/recordings
{ "sourcePath": "/Users/me/Movies/IMG_4211.MOV", "importMode": "copy", "sessionId": null }

202 Accepted
{ "recording": { "id": "01JAB3…", "status": "processing", "durationUs": 245300000 },
  "jobId": "01JAB3…" }
```

List proposals (while processing is still running):

```json
{
  "items": [
    {
      "id": "01JAB4…",
      "version": 1,
      "status": "pending",
      "origin": "detector",
      "detected": { "startUs": 12400000, "endUs": 31850000, "outcome": "fall", "confidence": 0.82 },
      "range": { "startUs": 10400000, "endUs": 33350000 },
      "padding": { "preUs": 2000000, "postUs": 1500000 },
      "outcome": "fall",
      "boulderId": null
    }
  ],
  "processing": { "complete": false, "processedUntilUs": 120000000 }
}
```

Fine-tune and commit:

```http
PATCH /api/v1/proposals/01JAB4…
{ "range": { "startUs": 10950000 }, "outcome": "top", "boulderId": "01J9ZK…", "expectedVersion": 1 }

POST /api/v1/recordings/01JAB3…/proposals/commit
{ "proposalIds": ["01JAB4…", "01JAB5…"], "cutMode": "auto" }
→ 202 { "jobId": "01JAB6…" }
```

`auto` cut mode = lossless when keyframe snapping expands each side by ≤ 1 s, otherwise exact.

Rate an attempt:

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

Training load:

```json
{
  "unit": "AU (session exertion × minutes)",
  "days": [
    { "date": "2026-10-15", "logged": true, "rest": false, "load": 770,
      "avg7": 305.7, "avg28": 270.1, "acwr": 1.13, "band": "steady" }
  ]
}
```

ACWR = 7-day average / 28-day average. Bands: < 0.8 `detraining`, 0.8–1.3 `steady`, 1.3–1.5
`caution`, > 1.5 `ramping_fast`. Averages are taken over logged days only: explicit rest days
count as load 0, days with no entry (`logged: false`) are excluded. A 7-day window with fewer
than 4 logged days, or a 28-day window with fewer than 14, returns `acwr: null` and band
`insufficient_data`. Entries without a duration have `load: null` and are excluded the same
way.

Comparison:

```json
{
  "id": "01JAB8…", "status": "ready", "engineVersion": "1.3.0",
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
| `proposals.updated` | `recordingId, processedUntilUs, complete` |
| `attempt.created` / `attempt.updated` | `attemptId` |
| `comparison.ready` | `comparisonId` |
| `model.registered` / `model.promoted` | `modelId, kind, status` |
| `originals.retention_due` | `videoIds` |

Clients reconnect with `Last-Event-ID`; the server keeps a 5-minute ring buffer.

### 4.5 Errors

```json
{ "type": "https://climbing-coach.app/problems/proposal-overlap",
  "title": "Proposals overlap", "status": 409, "code": "PROPOSAL_OVERLAP",
  "detail": "Range 10.95s–33.35s overlaps proposal 01JAB5…",
  "errors": [ { "path": "range.endUs", "message": "must be ≤ 30100000" } ] }
```

| Code | Status |
| --- | --- |
| `VALIDATION_FAILED` | 400 |
| `UNAUTHORIZED` / `FORBIDDEN_ORIGIN` | 401 / 403 |
| `NOT_FOUND` | 404 |
| `VERSION_CONFLICT`, `PROPOSAL_OVERLAP`, `ALREADY_COMMITTED` | 409 |
| `ORIGINAL_DELETED` | 410 |
| `UNSUPPORTED_MEDIA` | 415 |
| `POSE_WORKER_UNAVAILABLE`, `FFMPEG_UNAVAILABLE` | 503 |
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
    reprocess(id: Id): Promise<Accepted>;
    filmstrip(id: Id, q: FilmstripQuery): Promise<Filmstrip>;
    signals(id: Id): Promise<DetectorSignals>;
  };
  proposals: {
    list(recordingId: Id): Promise<ProposalList>;
    add(recordingId: Id, r: TimeRange): Promise<Proposal>;
    update(id: Id, p: ProposalPatch): Promise<Proposal>;
    split(id: Id, atUs: Us): Promise<[Proposal, Proposal]>;
    merge(ids: Id[]): Promise<Proposal>;
    reject(id: Id): Promise<Proposal>;
    restore(id: Id): Promise<Proposal>;
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
    poseTrack(videoId: Id, range?: TimeRange): Promise<PoseTrack>;
  };
  comparisons: { create(i: ComparisonInput): Promise<Comparison | Accepted<Comparison>>; get(id: Id): Promise<Comparison>;
                 warp(id: Id): Promise<Int32Array>; divergence(id: Id): Promise<Float32Array>;
                 feedback(id: Id, f: AlignmentFeedback): Promise<void>; export(id: Id, i: ExportInput): Promise<Accepted> };
  trainingLogs: { list(r: DateRange): Promise<TrainingLog[]>; get(date: string): Promise<TrainingLogDay>;
                  put(date: string, e: TrainingLogInput): Promise<TrainingLog>; remove(date: string): Promise<void> };
  stats: { trainingLoad(r: DateRange): Promise<TrainingLoadSeries>; exertionVolume(r: DateRange): Promise<ExertionVolumePoint[]>;
           focusDistribution(r: DateRange, bucket: 'week' | 'month'): Promise<FocusBucket[]>;
           gradePyramid(r: DateRange, d: Discipline): Promise<GradeCount[]>; weeklySummary(week: string): Promise<WeeklySummary> };
  insights: { list(q: InsightQuery): Promise<Insight[]>; feedback(id: Id, v: InsightVerdict): Promise<void> };
  models: { list(): Promise<ModelInfo[]>; train(kind: ModelKind): Promise<Accepted>; promote(id: Id): Promise<void>; rollback(id: Id): Promise<void> };
  jobs: { list(q: JobQuery): Promise<Job[]>; get(id: Id): Promise<Job>; cancel(id: Id): Promise<void>; retry(id: Id): Promise<Accepted> };
  bundles: { export(i: BundleExportInput): Promise<Accepted>; import(path: string): Promise<Accepted> };
  events: { subscribe(handler: (e: CoachEvent) => void): () => void };
}
```

Ports (in `packages/core/ports`):

```ts
export interface PoseExtractor {
  models(): Promise<PoseModelInfo[]>;
  extract(
    req: { videoPath: string; outPath: string; model: string; sampleFps: number; maxPersons: number },
    opts: { signal: AbortSignal; onProgress(p: Progress): void; onChunk(processedUntilUs: Us): void },
  ): Promise<{ frameCount: number; tracks: number; model: string; modelVersion: string }>;
}

export type CutMode = 'lossless' | 'exact' | 'auto';

export interface VideoTools {
  probe(path: string): Promise<ProbeResult>;          // codec, durationUs, rotation, isVfr, frameTable, keyframes
  makeProxy(src: string, dst: string, opts: TaskOpts): Promise<void>;
  cut(src: string, dst: string, range: TimeRange, mode: CutMode, opts: TaskOpts):
    Promise<{ actualRange: TimeRange; modeUsed: 'lossless' | 'exact'; frameCount: number }>;
  thumbnail(src: string, atUs: Us, dst: string, width: number): Promise<void>;
  filmstrip(src: string, range: TimeRange, count: number, dst: string, tileWidth: number): Promise<FilmstripLayout>;
}

export interface ComputePool {
  run<K extends keyof EngineTasks>(task: K, input: EngineTasks[K]['in'], signal?: AbortSignal): Promise<EngineTasks[K]['out']>;
}

export interface ModelTrainer {
  train(req: { kind: ModelKind; datasetPath: string; outPath: string }, opts: TaskOpts): Promise<TrainReport>;
}
```

Engine entry points (pure):

```ts
preprocess(track: PoseTrack, o?: PreprocessOptions): ProcessedTrack;
detectAttempts(t: ProcessedTrack, p?: DetectorParams): AttemptCandidate[];
detectorSignals(t: ProcessedTrack, p?: DetectorParams): DetectorSignals;
proposeCuts(c: AttemptCandidate[], o: { prePadUs: Us; postPadUs: Us; durationUs: Us }): ProposalDraft[];
segmentMoves(t: ProcessedTrack, range: TimeRange, p?: MoveParams): MoveSegment[];
align(a: AlignInput, b: AlignInput, o?: AlignOptions): Alignment;        // { path, moveMatches, unmatchedA, unmatchedB }
comparePostures(a: ProcessedTrack, b: ProcessedTrack, al: Alignment): ComparisonResult;
attemptFeatures(t: ProcessedTrack, moves: MoveSegment[], ctx: AttemptContext): FeatureVector;
trainingStats(logs: TrainingLog[], range: DateRange): TrainingStats;
prefillTrainingLog(date: string, attempts: AttemptSummary[]): TrainingLogPrefill;
evaluateRules(ctx: BoulderContext): InsightDraft[];
predict(model: ModelArtifact, x: Float32Array): Prediction;              // value + per-feature contributions
```

`ml-worker` stdio protocol (one JSON object per line):

```
→ {"id":"1","cmd":"hello"}
← {"id":"1","type":"result","capabilities":{"models":["mediapipe-heavy","rtmpose-m-body26"],"train":["logreg","gbdt"]},"version":"0.3.0"}

→ {"id":"2","cmd":"extract_pose","video":"/lib/originals/…mov","out":"/lib/pose/….posebin","model":"mediapipe-heavy","sampleFps":15,"maxPersons":3}
← {"id":"2","type":"progress","done":120,"total":3680}
← {"id":"2","type":"chunk","processedUntilUs":30000000}
← {"id":"2","type":"result","frameCount":3680,"tracks":2,"modelVersion":"0.10.14"}

→ {"id":"3","cmd":"extract_pose", …}
← {"id":"3","type":"progress","done":40,"total":5200}
→ {"id":"4","cmd":"cancel","target":"3"}
← {"id":"4","type":"result","cancelled":true}
← {"id":"3","type":"error","code":"CANCELLED","message":"Cancelled by client"}
```

Commands: `hello`, `extract_pose`, `train`, `cancel`, `shutdown`. Event types: `progress`,
`chunk`, `log`, `result`, `error`. The worker is long-lived; the Node client restarts it on
crash and fails the current step with a retryable error.

---

## 5. Development phases

No calendar estimates; phases are ordered by dependency, and each ends with a test gate from
section 6.

### 5.1 Tracks and dependencies

```
Track A — CV engine:  P0 data + bake-off ──► P1 engine + cutter ──► P2-B ingest/review ──► P3 compare ──► P4 ML
Track B — App:        P0 scaffolding ──► P2-A backend, shell, homepage ──► P2-C library/player/rating ──► P2-D packaging
Track C — Mobile:                              P5.1 spikes (after P1) ─────────────────────────────► P5.2–P5.6
```

Phase 2-A (backend foundation, training log, homepage) has no dependency on computer vision, so
the homepage can be used while the engine is still being tuned.

### 5.2 Phase 0 — Foundations, dataset, and pose model choice

| ID | Work package | Modules | Output |
| --- | --- | --- | --- |
| P0.1 | Monorepo scaffolding: pnpm + Turborepo, config presets, Vitest, ESLint/Prettier, dependency-cruiser rules, GitHub Actions (lint, typecheck, test), ADR template, PR template with definition of done | `config`, CI | Green empty pipeline |
| P0.2 | Schema v1: `Us`, ULID, `PoseTrack`, posebin reader/writer, label JSONL schemas, JSON Schema export; pydantic mirror + cross-language round-trip test | `schema`, `ml-worker` | Tagged schema v1 |
| P0.3 | Capture protocol and dataset: camera placement guide; 30–50 recordings (≥ 120 attempts) across slab / vert / overhang / roof, lighting, camera positions, ≥ 3 climbers, signed consent; manifest with SHA-256; private storage; frozen test split (30%) | `docs/capture-protocol.md`, `datasets/` | Dataset v1 |
| P0.4 | Labeling: temporal labels (start, end, outcome, limb placement events) in `research/label-tool`; cross-attempt move correspondences for ≥ 15 attempt pairs (alignment ground truth); keypoints on ~300 frames (≥ 100 hard: inverted, heel hooks, occluded) in CVAT | `research/label-tool` | Labels v1 |
| P0.5 | `ml-worker` v0: `extract_pose` for MediaPipe (lite/full/heavy) and RTMPose body26 (includes feet); YOLO-pose behind a research flag; IoU tracking for multiple people; posebin writer; stdio protocol | `workers/ml-worker` | Pose tracks for the dataset |
| P0.6 | Bake-off: PCK@0.2 (torso-normalized) overall and on the hard subset, landmark dropout rate, jitter on static holds, throughput on the reference laptop, availability and speed on iOS/Android | `research/harness` | ADR-001 pose model |
| P0.7 | Eval harness: dataset + labels + cached posebins (keyed by video SHA-256, model, sample fps) → metrics JSON + markdown report; baseline detector to validate the harness | `research/harness`, `apps/cli` (stub) | First eval report |

Exit gate: ADR-001 accepted; schema v1 tagged; test split frozen and hashed; eval harness
reports on the baseline; CI green.

### 5.3 Phase 1 — Engine, cutter, CLI (Track A)

Depends on P0.2, P0.5, P0.7.

| ID | Work package | Modules |
| --- | --- | --- |
| P1.1 | Preprocessing: climber track selection, One Euro filter, gap filling, normalization, body metrics, frame features | `engine/pose`, `engine/features` |
| P1.2 | Start / end / outcome detection, multi-attempt segmentation, detector signals for the UI | `engine/detect` |
| P1.3 | Cut proposals: padding, clamping, split, merge, overlap validation | `engine/cut` |
| P1.4 | Move segmentation and fall move index | `engine/moves` |
| P1.5 | Alignment: move matching, rest collapse, banded and open-end DTW | `engine/align` |
| P1.6 | Video tools: probe (frame table, keyframes, rotation, VFR), review proxy, lossless / exact / auto cut, thumbnails, filmstrip sprites | `adapters-node/video` |
| P1.7 | Fixtures: synthetic climber generator (stand → climb → fall / top / downclimb; sit start; second person; walk-out; mid-climb end), fixture videos (frame number burned in, VFR, rotated portrait, HEVC, long GOP), fake ports | `test-fixtures` |
| P1.8 | CLI: `coach process <video>`, `coach cut <video> --ranges`, `coach align <a> <b>`, `coach eval`, `coach bench` | `apps/cli` |
| P1.9 | Parameter tuning: grid search over detector parameters on the dev split; results committed with the params file | `research/harness`, `engine/detect` |

Exit gate: accuracy targets for detection, moves, and alignment (6.3) on the test split;
synthetic-warp property tests; cutter frame-hash tests; engine performance budgets (6.4);
coverage thresholds (6.2).

### 5.4 Phase 2 — Desktop MVP

| ID | Work package | Modules | Can start after |
| --- | --- | --- | --- |
| P2-A.1 | DB schema, migrations, repositories; backup-before-migrate | `db` | P0.2 |
| P2-A.2 | `core` skeleton: ports, services for settings, gyms, boulders, sessions, training logs, stats; job runner | `core`, `engine/stats`, `engine/grades` | P2-A.1 |
| P2-A.3 | Server: Fastify, auth, Host/Origin checks, problem+json, SSE, signed media URLs; conformance suite wired to HTTP | `apps/server`, `api` | P2-A.2 |
| P2-A.4 | Web shell: router, design system, `app-hooks` (queries, SSE invalidation), settings page, first-run library setup | `apps/web`, `ui-web`, `app-hooks` | P2-A.3 |
| P2-A.5 | Homepage: today's entry form with prefill and overrides, focus tags, grade breakdown; training load + ACWR, exertion vs. volume, focus distribution, grade pyramid, weekly summary | `apps/web`, `engine/stats` | P2-A.4 |
| P2-B.1 | Ingest pipeline with incremental proposals; ml-worker client; compute pool | `core`, `adapters-node` | P1, P2-A.3 |
| P2-B.2 | Review screen: timeline, filmstrip, activity track, handles, loupe, split / merge / reject / add, outcome + boulder picker, keyboard map | `apps/web`, `ui-web` | P2-B.1 |
| P2-B.3 | Commit pipeline: cut, pose slicing, moves, attempt creation, label recording | `core` | P2-B.1 |
| P2-C.1 | Library and recordings views, filters, re-cut, original retention prompts | `apps/web`, `core` | P2-B.3 |
| P2-C.2 | Attempt player: overlay modes (video + skeleton, skeleton only, trail), move markers | `apps/web`, `render` | P2-B.3 |
| P2-C.3 | Rating panel (proximity with anchors, CR10 exertion, outcome, fall move, tags, notes); boulder page with proximity-vs-exertion scatter; prefill wiring to homepage | `apps/web`, `core` | P2-C.2 |
| P2-C.4 | Bundle export / import (doubles as a backup; later the desktop → phone path) | `core/BundleService`, `apps/web` | P2-B.3 |
| P2-D.1 | Electron packaging: utility-process server, ffmpeg and ml-worker (PyInstaller) sidecars, signed macOS / Windows builds, Linux AppImage, opt-in update channel | `apps/desktop` | P2-C |
| P2-D.2 | Electron smoke tests and crash-resume tests | `apps/desktop` | P2-D.1 |

Exit gate: E2E flows 1–5 and 7–9 (6.5); dogfood gate (≥ 5 real gym sessions processed by the
team; median boundary adjustment < 0.3 s; logging a day takes ≤ 30 s); desktop performance
budgets (6.4).

### 5.5 Phase 3 — Comparison and export

| ID | Work package | Modules |
| --- | --- | --- |
| P3.1 | Posture comparison: joint-angle deltas, center of mass vs. support polygon, divergence series, per-move summaries with generated text | `engine/compare` |
| P3.2 | Comparison job, API, caching by `(attemptA, attemptB, engineVersion, optionsHash)` | `core`, `apps/server` |
| P3.3 | Comparison playback controller (movement-synced and real-time modes, drift correction) | `app-hooks/compare` |
| P3.4 | Compare UI: side-by-side, ghost overlay with opacity, divergence timeline, move difference panel, joint highlights; "Compare with…" suggesting the best previous attempt by proximity | `apps/web`, `render` |
| P3.5 | Alignment feedback button → label + regression case | `core`, `apps/web` |
| P3.6 | Export: skeleton overlay video, comparison video, GIF (server-side render + ffmpeg) | `core`, `adapters-node`, `render` |

Exit gate: E2E flow 6; real-pair alignment accuracy (6.3); comparison performance budgets;
visual snapshot tests for ghost overlay and divergence highlighting.

### 5.6 Phase 4 — Insights and learning loop

| ID | Work package | Modules |
| --- | --- | --- |
| P4.1 | Feature spec v1 (frame, move, attempt features) — the only feature implementation, used for both training and inference | `engine/features` |
| P4.2 | Dataset builder: labels + engine features → JSONL + `feature_spec.json` | `core/LabelService` |
| P4.3 | `ml-worker train`: on/off-wall frame classifier, end-of-attempt outcome classifier, proximity and exertion models (logistic regression and GBDT) | `workers/ml-worker` |
| P4.4 | TS model runtime: logistic regression, GBDT, TreeSHAP; parity tests against Python | `engine/models` |
| P4.5 | Model registry, shadow mode, promotion and rollback, detector health panel | `core/ModelService`, `apps/web` |
| P4.6 | Insights: Stage A rules (sent vs. failed differences at the fall move, high-exertion / low-proximity flag), Stage B model-backed insights with contributions, "based on N attempts" evidence, feedback buttons | `engine/insights`, `core`, `apps/web` |
| P4.7 | Personalization: padding auto-tune from boundary deltas | `core` |

Exit gate: ML targets (6.3); TS/Python parity; shadow-mode promotion works end to end with
rollback; insights never shown below their minimum-N guard.

### 5.7 Phase 5 — Mobile

| ID | Work package | Modules |
| --- | --- | --- |
| P5.1 | Spikes (gate before the full build): native pose throughput on reference devices; lossless trim correctness of AVFoundation and Media3 on fixture videos; engine compute off the UI thread (worklet runtime vs. chunked scheduling); Drizzle + expo-sqlite migrations parity. Output: ADR-00x | `apps/mobile/modules`, `adapters-native` |
| P5.2 | `adapters-native` and in-process `CoachApi`; conformance suite running on device through a hidden test screen | `adapters-native`, `core` |
| P5.3 | Capture screen: vision-camera, framing guide, stability indicator, exposure/focus lock, direct hand-off to ingest | `apps/mobile` |
| P5.4 | iOS feature parity: home + charts, review (touch handles, haptics, pinch-zoom), library, player with Skia overlay, rating, boulder page, comparison, bundles via share sheet / Files | `apps/mobile` |
| P5.5 | Android parity and device matrix | `apps/mobile` |
| P5.6 | Release readiness: permission copy, App Store privacy labels and Play data-safety form (no data collected), opt-in crash reporting, TestFlight and Play internal track | `apps/mobile` |

Exit gate: conformance suite green on device; mobile performance budgets (6.4); pose parity
between desktop and device within tolerance (6.2); Maestro flows for record → review → cut →
rate → compare → log day.

### 5.8 Phase 6 — Optional

- Sync service: the first real cloud backend (Postgres + S3-compatible object storage;
  per-row `version` and `updatedAt` with last-writer-wins per field; media uploaded as
  content-addressed objects; Sign in with Apple / Google). ULIDs and version columns from v1
  make this additive.
- Coach sharing, wall-space homography overlay, live on-wall detection while recording.

---

## 6. Test criteria

### 6.1 Test layers

| Layer | Tool | Scope | Runs |
| --- | --- | --- | --- |
| Unit | Vitest, fast-check | `schema`, `engine`, `core` (fake ports), `render`, `app-hooks` | Every PR |
| Contract | Vitest + pytest | posebin TS ⇄ Python, label JSONL, model artifact parity, JSON Schema snapshots | Every PR |
| API conformance | shared suite in `packages/api` | Same suite against (a) `core` in-process and (b) HTTP server; later (c) on device | Every PR (a, b); Phase 5 nightly (c) |
| Integration | Vitest + real ffmpeg + fake pose | Job pipelines, video tools on fixture videos, migrations | Every PR |
| E2E | Playwright (web + Electron), Maestro (mobile) | User flows in 6.5 | Every PR (fake pose); nightly (real ml-worker) |
| Visual | Playwright screenshots, server painter snapshots | Charts, overlays, ghost view | Every PR |
| Eval | `coach eval` + harness | Accuracy on the dataset (6.3) | PRs touching `engine/detect\|moves\|align\|compare`, `ml-worker`; nightly full |
| Performance | `coach bench`, Playwright traces, device runs | Budgets in 6.4 | Nightly; release |

### 6.2 Module-level criteria

| Module | Must be covered | Threshold |
| --- | --- | --- |
| `schema` | posebin round trip, NaN handling, Float64 timestamps, Python parity | 100% of format branches |
| `engine/pose` | One Euro filter vs. reference implementation; gap fill; normalization invariance under translation and scale (property test) | ≥ 90% lines |
| `engine/detect` | Synthetic scenarios: stand → climb → fall; sit start; top + downclimb; jump-off from top; two attempts with mat rest; walk out of frame; second person in frame; recording ends mid-climb — each with expected boundaries ± 1 frame | All scenarios pass |
| `engine/cut` | Properties: ranges inside `[0, duration]`; no overlap after any sequence of split / merge / update; split covers the original range | Property tests, 1000 runs |
| `engine/moves` | Synthetic placements recovered | All synthetic cases |
| `engine/align` | A vs. A → diagonal path; synthetic warps (random slow-downs and inserted rests) recovered; path monotonic and continuous; open-end prefix | Property tests (6.3 thresholds) |
| `engine/compare` | Identical inputs → zero divergence; injected angle offset recovered within 1° | — |
| `engine/stats` | Hand-computed ACWR fixtures; missing days; explicit rest days; DST and time-zone boundaries | 100% of branches |
| `engine/models` | TS vs. Python predictions and contributions | max abs diff ≤ 1e-6 |
| `engine` overall | — | ≥ 90% lines, ≥ 85% branches |
| `db` | Migrations from empty and from every released schema snapshot; FK behavior (deleting an original keeps clips) | All migrations |
| `core` | Pipeline step idempotency and resume after a simulated crash at each step; labels written on commit / reject / confirm; cancel propagates | ≥ 85% lines |
| `adapters-node/video` | Probe VFR and rotation; proxy PTS equal to original PTS; lossless cut expands outward only and contains every requested frame (framemd5); exact cut first/last frame equal to requested (burned-in frame number); `auto` decision; rotation preserved | All fixture videos |
| `apps/server` | Every route through the conformance suite; 401 without token; 403 wrong Host / Origin; expired signature rejected; range requests; SSE resume with `Last-Event-ID` | 100% of routes |
| `apps/web` | `RatingPanel`, timeline handle math, `TodayEntryForm` prefill / override, keyboard map | Component tests |
| `ml-worker` | Protocol (hello, cancel, crash), posebin parity, each model backend on a fixture clip within landmark tolerance | pytest |
| mobile | Same pose on a fixture clip on desktop and device | mean landmark difference ≤ 0.01 (normalized coords) |

### 6.3 Accuracy targets (frozen test split)

| Metric | Target | Phase |
| --- | --- | --- |
| Pose PCK@0.2 (torso-normalized), all frames / hard subset | ≥ 0.80 / ≥ 0.60 (initial; recalibrated by ADR-001) | 0 |
| Start boundary error ≤ 0.5 s | ≥ 90% of attempts | 1 |
| End boundary error ≤ 0.5 s | ≥ 90% of attempts | 1 |
| Attempt detection recall | ≥ 95% | 1 |
| False-positive proposals | ≤ 0.2 per minute of recording | 1 |
| Fall recall; top/fall confusion | ≥ 90%; < 10% | 1 |
| Limb placement event F1 (±0.3 s) | ≥ 0.85 | 1 |
| Synthetic warp recovery (15 fps) | mean error ≤ 1 frame; ≥ 95% of frames within 2 frames | 1 |
| Real-pair move-match accuracy | ≥ 90% of labeled correspondences | 3 |
| Median user boundary adjustment (dogfood) | < 0.3 s; ≥ 60% of proposals committed with both handles moved < 0.5 s | 2 |
| Learned detector vs. heuristic | F1 improvement ≥ 3 points, no metric worse by > 1 point | 4 |
| Proximity / exertion model | MAE lower than the per-boulder-mean baseline on held-out attempts | 4 |

### 6.4 Performance budgets

Reference desktop: 2021-or-newer laptop (Apple M1 or 8-core x86, no discrete GPU). Reference
phones: iPhone 13, Pixel 7. Pose-dependent budgets assume the model chosen in ADR-001 and are
re-baselined there if that model is slower.

| Operation | Budget |
| --- | --- |
| Ingest 60 s 1080p30 recording (proxy + pose at 15 fps + detect), desktop | ≤ 60 s |
| First proposals visible for a 10-min recording | ≤ 90 s after import |
| Lossless cut of one clip from a 5-min 1080p original | ≤ 3 s |
| Exact cut of one clip | ≤ 10 s |
| `preprocess` + `detectAttempts` on a 10-min track | ≤ 1 s |
| `align` two 60 s attempts | ≤ 300 ms desktop, ≤ 1.5 s mobile |
| Review timeline drag | 60 fps; displayed frame follows handle within 50 ms |
| Skeleton overlay playback | ≤ 1% dropped frames at 1× |
| Homepage render with one year of logs | ≤ 300 ms after data arrives |
| CRUD API p95 | ≤ 50 ms |
| Desktop cold start to interactive home | ≤ 3 s |
| Mobile ingest of a 60 s clip | ≤ 120 s, no "serious" thermal state |
| Mobile peak memory during ingest | ≤ 600 MB |

Benchmarks fail CI when a result regresses by more than 10% against the stored baseline.

### 6.5 End-to-end flows

1. First run → choose library folder → empty homepage.
2. Log today's training → all homepage charts include the day.
3. Import a recording with three attempts → proposals appear incrementally → move one start by
   five frames, split one merged proposal, reject a false positive, add a missed attempt →
   commit → four clips in the library; labels recorded with correct deltas.
4. Rate an attempt (proximity 4, exertion 7) → point appears on the boulder scatter; homepage
   prefill reflects the new exertion.
5. Re-cut an attempt from its original.
6. Compare two attempts paced differently → movement-synced playback; divergence timeline;
   flag a misaligned move → regression case stored.
7. Delete an original → clips remain; re-cut is disabled with an explanation.
8. Export a bundle and import it into a fresh library → identical attempts, ratings, logs.
9. Kill the app mid-ingest → relaunch → job resumes from the last incomplete step.

### 6.6 CI gates

| Trigger | Jobs (all must pass to merge) |
| --- | --- |
| Every PR | lint, typecheck, dependency rules, unit (TS + Python), contract, conformance (in-process + HTTP), integration with ffmpeg, Playwright E2E with fake pose, visual snapshots, web bundle size check |
| PR touching detection, moves, alignment, comparison, or `ml-worker` | + eval on the dev split using cached posebins; metric deltas posted as a PR comment; merge blocked if any 6.3 metric drops below target or by > 1 point |
| Nightly | Full eval on the test split with real pose inference, benchmarks, Electron packaging smoke, E2E with real ml-worker, (Phase 5) device conformance and Maestro runs |
| Release | Signed builds, migration tests from every released schema, manual gym QA checklist |

Manual gym QA checklist (per release): record two sessions on two walls with a propped phone;
run the whole review flow; compare two attempts; log both days; check that no clip lost
climbing at either boundary.

### 6.7 Definition of done (every PR)

- Tests added or updated at the right layer; CI green.
- Public types or API changed → `api` schemas, conformance suite, and this document updated.
- Algorithm changed → `engineVersion` bumped when outputs change; eval report attached.
- Migrations included and tested for any schema change.
- No new outbound network calls; no new dependency with an incompatible license.

---

## 7. Feedback loops

Every loop records its signal locally in `labels` (or `insights.feedback`), has a metric, and
has a consumer that changes the product. Nothing leaves the device unless the user exports it.

### 7.1 Auto-cut boundary loop (user ⇄ detector)

- **Signal:** on commit, `start` and `end` labels with detected vs. final boundaries and
  deltas; on reject, a false-positive label; on manual add, a false-negative label; all
  stamped with `detectorVersion`.
- **Immediate use:** after ≥ 10 committed proposals, padding defaults auto-tune to the median
  delta plus a 0.25 s margin (bounded 0.5–5 s; user override wins).
- **Offline use:** labels feed the on-wall/off-wall and end-of-attempt classifiers (P4.3).
- **Metrics (detector health panel, `/detector-health`):** share of proposals committed with
  both handles moved < 0.5 s, median |delta| start and end, false-positive and false-negative
  rates, all per detector version.

### 7.2 Outcome loop

- **Signal:** auto outcome vs. confirmed outcome per attempt.
- **Use:** confusion matrix in the detector health panel; training data for the outcome
  classifier.

### 7.3 Model promotion loop (shadow mode)

1. `train-model` registers a new model as `shadow`.
2. On every new recording, the shadow model runs alongside the active one; its proposals are
   stored, not shown.
3. After ≥ 30 committed proposals, shadow and active are scored against the user's final
   boundaries.
4. Promote when the shadow wins on the primary metric and loses on none by more than 1 point;
   otherwise retire it.
5. Automatic rollback if the acceptance rate of the newly active model drops by > 10 points
   over the next 30 proposals.

### 7.4 Rating → insight loop

- **Signal:** proximity and exertion per attempt, pose features, outcome.
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

- Eval reports per PR with metric deltas; nightly trend file per metric stored as a CI
  artifact; benchmark baselines updated only by an explicit commit.
- Cached posebins mean engine changes are evaluated in seconds without rerunning pose models.
- Every false boundary found in dogfooding becomes a labeled clip in the dev split (never the
  frozen test split, which only grows at planned dataset versions).

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
| Pose model (MediaPipe vs. RTMPose) | ADR-001, end of Phase 0 | If RTMPose wins, move desktop inference to `onnxruntime-node` and keep Python only for training |
| Smart (exact) cut concat breaks on some H.264/HEVC streams | Phase 1 fixture tests | Re-encode the whole clip when the decode check after concat fails |
| HEVC playback in the renderer on Linux | Phase 2 | Review proxy already H.264; also generate clip proxies on Linux |
| Shipping Python via PyInstaller (size, notarization) | Phase 2-D | ONNX path above; or download the worker on first use |
| Engine compute on mobile blocks the UI thread | P5.1 spike | Chunked scheduling with yields; move DTW to a native module |
| Background processing limits on iOS | P5.1 spike | Foreground processing with progress; jobs resume on relaunch |
| Sparse labels for Phase 4 models | Phase 4 | Stage A rules remain the primary insight source; models stay in shadow |
| ACWR bands are team-sport heuristics | Phase 2-A | Shown as guidance with an explanation, never as medical advice |
