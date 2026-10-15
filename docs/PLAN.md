# Climbing Coach App — Build Plan

## Goal

Build an app that lets climbers record bouldering videos, document their attempts, and
analyze their movement over time. The app starts as a standalone local desktop application
for macOS and then moves to iOS and Android.

This is the product plan. The engineering plan (stack, modules, API, architecture, phases,
test criteria, feedback loops) is in [`BUILD_PLAN.md`](./BUILD_PLAN.md).

## Requirements

Functions:

- Automatically detect when the climber starts on the wall for the boulder
- Automatically detect when the climber falls
- Auto-cut: use the detected start and fall to propose a cut of each attempt, let the user
  fine-tune the start and finish, then cut the original video and store the clip in the library
- Generate a posture skeleton view of the climber's movement
- Generate an overlay or side-by-side comparison of two videos of the same boulder
- Analyze and mark differences in postures
- Handle different pacing between attempts (e.g. resting longer on a hold); match movement, not time
- Let the user rate each attempt with two scores — proximity to success and exertion — so
  that, combined with the skeleton data, ML can learn what drove progress
- Video library where the user stores videos
- Homepage where the user records today's training effort (exertion, number of boulders or
  routes, training focus such as capacity / strength / endurance) with a graph view over time

Platform: standalone app on a local environment first — a macOS desktop app (macOS 13 Ventura
or later, Apple Silicon) — then iOS and Android. Windows, Linux, and Intel Macs are out of scope
for v1.

---

## 1. Architecture: one engine, two shells

The hard, risky part of this app is the analysis pipeline (pose → attempt segmentation →
alignment → comparison), not the UI. The architecture keeps that pipeline portable so the
"move to iOS/Android" step is a UI port, not a rewrite.

```
┌─────────────────────────────────────────────────────────────┐
│ UI shell                                                    │
│   Local: React web app (Vite) → Electron app for macOS      │
│   Mobile: React Native / Expo (iOS + Android)               │
├─────────────────────────────────────────────────────────────┤
│ Analysis engine (TypeScript, pure math, shared everywhere)  │
│   segmentation · alignment (DTW) · metrics · insights       │
├─────────────────────────────────────────────────────────────┤
│ Pose adapter (platform-specific, emits one track format)    │
│   Same model on all platforms, runtime chosen in ADR-001:   │
│   ONNX Runtime (preferred) or MediaPipe Tasks               │
├─────────────────────────────────────────────────────────────┤
│ Storage: SQLite (metadata) + files (video, pose, thumbs)    │
└─────────────────────────────────────────────────────────────┘
```

Key decisions:

- **Pose extraction is the only platform-specific layer.** Everything downstream consumes a
  versioned `PoseTrack` (per frame: timestamp, 33 landmarks with x/y/z/visibility, stored in a
  compact binary file). This contract is what makes the mobile port cheap.
- **Analysis engine in TypeScript, not Python.** DTW over ~2000 frames × ~80 features is cheap
  in JS, and TS runs unchanged on desktop (browser/Node) and mobile (Hermes). Python is used
  for research and evaluation only; nothing Python ships in the app.
- **React → React Native.** State, hooks, timeline math, and overlay-rendering logic are shared;
  view components are rewritten for RN. Flutter (Dart engine + Flutter desktop) is the viable
  alternative; choose RN unless the team already knows Flutter.
- **Processing is offline, after recording.** Bouldering clips are 20–90 s, so processing at
  15–30 fps after the fact is acceptable and avoids thermal/battery problems on phones. A cheap
  first pass finds the active parts of long recordings so the pose model only runs where
  someone is climbing. Live detection is a later optimization.
- **Local-first, on-device by default.** Videos of people in gyms are sensitive; no cloud
  dependency in v1.
- **macOS first on the desktop.** Most users film on an iPhone, and the videos reach the Mac
  through iCloud Photos, so the desktop app imports straight from Photos. Targeting one OS on
  Apple Silicon means one ffmpeg build with Apple's hardware video codecs (VideoToolbox), HEVC
  and HDR iPhone footage that plays natively, and the same CoreML acceleration for the pose
  model on the Mac and the iPhone. The stack (Electron, TypeScript, ffmpeg) stays
  cross-platform, so Windows or Linux later is packaging work, not a rewrite.

Pose model candidates: MediaPipe Pose Landmarker and RTMPose (with feet keypoints); YOLOv8-pose
is compared in research only because of its AGPL license. Climbing is a known weak spot for
pose models (inverted bodies, heel hooks, occlusion by volumes, low camera angles), so Phase 0
runs a bake-off on labeled climbing footage. The decision (ADR-001) covers both the model and
the runtime that ships on desktop and mobile; the adapter boundary means swapping models later
does not touch the engine.

---

## 2. Design for each required function

### 2.1 Pose track preprocessing (foundation for everything)

- **Person selection.** Gyms have multiple people in frame. Track all detections; pick the
  climber as the track with the most motion near the wall region. The review screen has a
  "Wrong climber?" picker that shows every tracked person on the current frame; choosing one
  re-runs detection.
- **Smoothing.** One Euro filter per landmark; confidence gating (drop landmarks below a
  visibility threshold, interpolate short gaps).
- **Normalization (for comparison, not detection).** Origin at mid-hip, scale by torso length
  (mid-shoulder to mid-hip). No left/right mirroring — beta is boulder-specific.
- **Derived features.** 8 joint angles (elbow, shoulder, hip, knee × 2 sides), trunk
  inclination, hip offset from hand centroid (2D proxy for "hips in to the wall"), per-joint
  velocities.
- **Camera-motion check.** The first-pass activity scan also estimates global image motion
  between frames; if the phone was handheld and moving, the recording gets a warning.
  Stabilization is a later addition. Body-centric normalization keeps comparison usable either
  way.
- **Orientation.** Phone videos carry rotation metadata; all pose coordinates are stored in the
  orientation the video is displayed in.

### 2.2 Start detection ("climber is on the wall")

- **Floor estimate:** lowest ankle y during the initial standing segment (plus optional
  mat-edge detection). If the recording starts with the climber already on the wall, fall back
  to the lowest ankle position over the whole recording, and mark the start as low confidence.
- **Start** = first frame where both ankles are above the floor by > k × body height, hips have
  low vertical velocity for ≥ 0.5 s (established on the wall, not jumping), and both wrists
  are above shoulder height. Sit starts are handled by the ankle rule alone.
- **Multiple attempts per recording:** each start→end pair becomes an `Attempt`; rests on the
  mat are excluded.
- **Corrections become labels.** The UI shows the detected boundary with trim handles. Every
  manual correction is stored and later trains a per-frame on-wall/off-wall classifier
  (windowed pose features → logistic regression first; gradient boosting only if it
  measurably wins) that replaces the heuristics once it beats them.

### 2.3 Fall detection and attempt outcome

- End-of-attempt classifier with three outcomes: **fall**, **controlled drop/downclimb**,
  **top** (success).
- **Fall signal:** downward hip velocity normalized by body height exceeding a threshold (free
  fall approaches g; controlled downclimbing is far slower), a velocity discontinuity (sudden
  release), then ankles returning to floor level. Also handles exit-from-frame and
  end-of-video.
- **Top vs. jump-off:** both hands stationary at the attempt's highest wrist position for ≥ N
  frames before descent → top. Everything else fast → fall.
- **Exit direction:** on walls that are topped out over, the climber leaves through the top of
  the frame and the dwell rule never fires. Leaving through the top after reaching the highest
  hand position → top; leaving through a side or the bottom → unknown, for the user to confirm.
- The **fall move index** (see 2.5) is stored with the attempt so analytics can say "falls
  cluster on move 4".
- User confirms the outcome; confirmations are labels.

### 2.4 Auto-cut: detect → propose → fine-tune → cut → store

Auto-cut turns the raw recording (often several attempts plus walking around and resting) into
one trimmed clip per attempt in the library. It is the main capture workflow and is built
directly on 2.2 and 2.3.

**Pipeline**

1. **Detect.** A cheap first pass over keyframes finds the *active windows* of the recording
   (where something is moving). Pose extraction runs only on those windows, then start
   detection (2.2) and end-of-attempt detection (2.3) produce candidate climb ranges — one per
   attempt. Proposals appear while the rest of the recording is still processing. If an
   attempt was missed, "Process whole recording" runs pose on everything.
2. **Propose.** Each candidate becomes a *review item*. Its two handles mark the **climb
   range**: the first frame on the wall and the fall/top frame. Padding — a pre-roll (default
   2 s, so the setup on the starting holds is visible) and a post-roll (default 1.5 s, so the
   landing or match on the finish is visible) — is shown as a shaded extension and applied
   only when cutting, clamped to the video bounds. Padding is a user setting, not something
   the user drags. Nothing is written to disk at this stage; the review is a draft that
   references the original.
3. **Fine-tune.** The review screen shows the raw video timeline with each item as a
   draggable climb range. Per item the user can:
   - drag the start and end handles with frame-step nudging (±1 frame, ±0.5 s), a filmstrip,
     and a pre-rendered frame strip (loupe) around each handle for precision;
   - toggle a "skeleton" preview on the handle frame to confirm the climber is actually on the
     wall / actually falling;
   - split an item in two (detection merged two attempts), merge adjacent items (detection
     split one attempt), reject a false positive, or add a range the detector missed;
   - confirm the outcome (fall / drop / top), pick the boulder (the previous item's boulder is
     the default, and a new boulder can be created inline), and optionally enter the two
     scores from 2.9 while the attempt is fresh.

   Every edit can be undone and redone, and the draft is saved automatically. Climb ranges may
   not overlap; padded clips may share frames. If detection is updated while the user is
   reviewing (more of the recording processed, or a different climber chosen with the track
   picker from 2.1), new items are merged in, and items the user has edited are never changed.
4. **Cut.** On commit, the original video is cut into one clip file per attempt (climb range
   plus padding). The default cut is lossless: stream copy, with the boundaries expanded
   outward to the nearest keyframe, never inward, so no climbing is lost. When a camera's long
   keyframe interval would expand a clip by more than 2 s, the clip is re-encoded instead
   (hardware encoder where available). Desktop uses `ffmpeg`; mobile uses AVFoundation (iOS)
   and Media3 Transformer (Android) behind the same interface.
5. **Store.** Each clip becomes an `Attempt` in the library with its own `Video` record,
   thumbnail, and a `PoseTrack` sliced from the already-computed track (no re-processing); a
   higher-frame-rate pose track is computed in the background afterwards. The attempt stores
   its climb range in clip time — moves, comparisons, and alignment use only that range —
   plus a reference to the original and the clip's position in it, so the cut is
   reproducible and re-adjustable.

**Original video handling**

- The original is kept until the user explicitly deletes it; a "keep originals" setting
  (default: keep for 30 days, then prompt) controls storage growth.
- Re-cut is always possible from the original as long as it exists; after deletion the clip
  becomes the source of truth.

**Corrections as training data**

- At commit, the detector's climb ranges are compared with the user's final climb ranges.
  Padding is not part of either, so the labels measure detector error only: start and end
  deltas, rejected items (false positives), added items (false negatives), and merges and
  splits. These labels train the on-wall/off-wall and end-of-attempt classifiers in 2.2/2.3.
- If a user's corrections are consistently in one direction (at least 20 labels, at least 70%
  with the same sign), the detector applies a per-user boundary offset, bounded to ±1 s and
  visible in the detector health view. Padding is never tuned automatically.

**Edge cases**

- Recording ends mid-attempt: end handle snaps to the last frame, outcome defaults to
  "unknown".
- Climber walks out of frame and back: treated as an end + new start unless the gap is shorter
  than a configurable threshold.
- No attempt detected: the user is offered the full video as a single manual range.
- Very long recordings (session-long, > 10 min): the activity pass keeps pose extraction to
  the active windows; processing runs in the background with a progress indicator, and
  proposals appear incrementally.
- Wrong person detected (several climbers in frame): the track picker re-runs detection on the
  chosen climber; items already edited are kept.

### 2.5 Move segmentation (the unit everything else needs)

- A hand move = a wrist leaving a stationary period and settling into a new one; stationary
  periods are holds. Same for feet.
- Attempts become sequences of moves. This gives climber-meaningful units for comparison
  ("move 3"), fall location, and the anchors for alignment in 2.7.

### 2.6 Skeleton view

- Render landmarks and bones on a canvas over the video (`requestVideoFrameCallback` for
  frame-accurate sync in the browser; a Skia canvas over the video player on mobile). Both
  draw from the same platform-independent draw commands.
- HEVC clips from an iPhone play directly on the Mac. Clips that are HDR or above 1080p get an
  H.264 SDR playback proxy, so overlays and side-by-side comparisons look consistent and play
  smoothly.
- Modes: overlay on video, skeleton-only on blank background, trail view (hip path over time).
- Export as MP4/GIF for sharing.

### 2.7 Two-video comparison with pace-invariant alignment

**Spatial alignment**

- Default: body-centric normalization (2.1), comparing body shape independent of camera
  placement.
- Wall-space mode (stretch): estimate a homography between the two videos from ORB/SIFT
  matches on the wall holds in a reference frame, with a 4-point manual fallback. Enables
  true overlay in wall coordinates.

**Temporal alignment (the pace problem)**

- **Hierarchical alignment.** First align at the move level by matching hand-placement events
  between attempts (sequence alignment on move count and hand identity); then run Dynamic
  Time Warping within each matched move pair.
- **Match movement, not rests.** DTW features are z-scored joint positions plus velocities and
  joint-angle derivatives, so static frames score as similar to static frames regardless of
  duration. Additionally, collapse near-stationary runs (velocity below threshold) to a few
  representative frames before DTW, so a 10 s rest and a 1 s rest both cost nothing to align.
- **Open-ended DTW** when one attempt ended early (fell at move 4) so the prefix aligns cleanly
  and the remainder is marked "no counterpart".
- **Output:** a warp path mapping frames A↔B, used to drive synchronized side-by-side playback
  and ghost-skeleton overlay.

**Automated alignment test.** Take one clip, apply a known synthetic time warp (slow one
section, insert a rest), run the aligner, and check it recovers the warp. This makes DTW tuning
regression-testable without human judgment.

### 2.8 Posture difference analysis

- **Per aligned frame:** joint-angle deltas, hip offset from hand centroid, center of mass vs.
  the support polygon (feet/hands), limb extension. Threshold → highlight divergent joints in
  color on the overlay; a divergence-score timeline under the scrubber.
- **Per move:** aggregated statistics ("right hip 15° more open through move 3", "hips 0.2
  torso-lengths further from hands at move 5 crux").
- Phrased as observations, not prescriptions, until the model in 2.9 has evidence.

### 2.9 Ratings and learning from progress

Each attempt carries two independent scores, entered during auto-cut review or right after the
cut is committed (and editable later from the library):

1. **Proximity to success** (1–5): how close the attempt felt to a send, regardless of the
   recorded outcome. Anchors shown in the UI: 1 "couldn't do the move", 2 "touched the next
   hold", 3 "held it but couldn't move on", 4 "one move / one slip from the top", 5 "sent, or
   would have with a clean repeat". For a sent attempt the score shifts to quality of the send
   (5 = smooth, 3 = barely held on). Kept separate from the auto-detected outcome because
   "fell at the last move feeling solid" and "fell at the last move completely out of control"
   are different data points.
2. **Exertion** (1–10, Borg CR10 style): how much effort the attempt took. Anchors: 1 "warm-up
   easy", 3 "moderate", 5 "hard", 7 "very hard", 10 "absolute limit". Captured per attempt so
   fatigue within a session is visible (same boulder, rising exertion, falling proximity).

Also stored per attempt: outcome (auto-detected, confirmed), fall move, optional structured
tags (felt balanced / powerful / pumped / beta change), free notes. Everything sits alongside
the pose track, moves, and derived metrics.

The two scores are plotted against each other on the boulder page (proximity on y, exertion on
x, one point per attempt, colored by session): progress shows as points moving up and left —
closer to the send for less effort.

Learning, staged:

- **Stage A — rule-based (works from the first session).** Within one boulder, compare sent vs.
  failed attempts and surface the features that differ most at the fall move. Also flag
  attempts with high exertion and low proximity as candidates for a beta change rather than
  "try harder".
- **Stage B — small-data ML.** Per-move feature vectors → L2-regularized logistic regression,
  trained on-device in TypeScript (desktop and mobile alike, no Python), with per-feature
  contributions, predicting outcome, proximity, and exertion. Gradient boosting with SHAP
  values is tried in research and adopted only if it beats logistic regression by a clear
  margin. Exertion as a target is what lets the model separate "efficient movement" from
  "powering through". Per-boulder data is sparse, so models train across the user's boulders
  on normalized features, with per-boulder deltas shown for interpretation. New models run in
  shadow mode first and are promoted only if they beat the active model, with automatic
  rollback.
- **Stage C — optional, opt-in.** Aggregated anonymized pose data across users for general
  technique models. Out of scope until the single-user loop proves useful.
- The start/fall correction labels from 2.2/2.3 feed their own classifiers independently.

### 2.10 Video library

- **Entities:** `Climber` (profile), `Gym`, `Boulder` (name, grade, color, set date, wall
  photo), `Session`, `Video` (file ref, camera metadata, `kind`: original or clip,
  discipline: boulder or route, review state, and for clips a reference to the original plus
  the clip's position in it), `ReviewItem` (detected and final climb range, padding, outcome,
  boulder, scores, whether the user edited it), `Attempt` (clip video, climb range in clip
  time, outcome, fall move, proximity score, exertion score, tags, notes), `PoseTrack`,
  `MoveSegment`, `Comparison` (attempt A/B, warp path, metrics), `TrainingLog` (see 2.11).
- **Library views:** the default library lists attempts (clips), not raw recordings; originals
  live under a separate "Recordings" view with their review state (unreviewed / in review /
  done) and warnings, their derived clips listed beneath them, and a "re-cut" action.
- **Getting videos in:** on the Mac, import from Photos (including videos that are only in
  iCloud, with download progress) or drag files and folders in from Finder; on mobile, record
  in the app or import from Photos. The video's creation date proposes the session.
- **Library location (Mac):** defaults to a folder in Movies; folders synced by iCloud Drive or
  Dropbox are refused, because syncing a live database corrupts it (bundles are the way to move
  a library). Rebuildable caches are excluded from Time Machine. Processing keeps running when
  the window is closed, and the Mac does not go to sleep until it finishes.
- **Deleting:** deleting anything moves it to a trash, restorable for 30 days. Purging an
  original keeps its clips and attempts; purging an attempt keeps its correction labels, so
  training data is not lost.
- **Storage:** SQLite for metadata (identical on desktop and mobile), files on disk for video,
  playback proxies, pose tracks (compact binary), thumbnails. Every row carries created,
  updated, and deleted timestamps so sync can be added later without a schema rewrite. The
  database is backed up daily and before every migration.
- **Bundles:** export/import as a zip with a manifest and file hashes — all rows in scope
  (attempts, ratings, logs, labels, insight feedback, settings, models) plus clips, proxies,
  pose tracks, and optionally originals. Bundles move desktop-processed data to the phone
  before sync exists and double as a backup.
- **Browsing:** filters by boulder, grade, outcome, date range, proximity, exertion. Boulder
  page shows attempt history and the proximity-vs-exertion chart.

### 2.11 Homepage: daily training log and graphs

The homepage is a training diary, not the video library. It opens on today and takes under
30 seconds to fill in.

**Daily entry (`TrainingLog`, one row per day, editable all day)**

- **Session exertion** (1–10, same CR10 scale as per-attempt exertion). When rated attempts
  exist, it is pre-filled with round(0.5 × max + 0.5 × mean) of that day's attempt exertion
  scores, because the mean alone underestimates a session's effort. The basis ("12 attempts,
  mean 6.4, max 9") is shown next to the field, and the user can override it.
- **Which day:** attempts belong to the day of their session (confirmed at import, defaulting
  to the video's creation time), in the climber's local time; a session that crosses
  midnight belongs to the day it started.
- **Volume:** number of boulders and/or routes climbed (two separate counters), with optional
  grade breakdown (e.g. 3 × V3, 2 × V5). Pre-filled from today's logged attempts (distinct
  boulders) and adjustable, since not every climb is filmed.
- **Training focus** (multi-select, with one marked primary): capacity, strength, power,
  endurance, power-endurance, technique, projecting, flexibility/mobility, rest/active
  recovery. Users can add custom focus tags.
- **Session type:** climbing, board (Kilter/Moon/Tension), hangboard, gym/weights, cardio,
  rest.
- **Duration** (minutes), optional.
- **Body state:** finger/skin/joint flags and a free-text note, optional.
- **Derived, not entered:** training load = session exertion × duration (session-RPE method),
  which becomes the basis of the load graphs below.

**Graph view**

All charts share one time-range selector (1 week / 4 weeks / 3 months / 1 year / all) and are
labeled with axis units.

- **Training load over time:** daily load bars with a 7-day and a 28-day average line (rolling
  averages by default, exponentially weighted as an option). The ratio between them
  (acute:chronic workload ratio) is shown as a small indicator with "ramping fast" / "steady" /
  "detraining" bands — the one number that tells a climber whether they are overdoing it. The
  bands come from team-sport research, so they are presented as guidance with an explanation,
  not as medical advice.
- **Exertion vs. volume:** per-day points (volume on x, exertion on y) — the same "up and left
  is better" reading as the per-attempt chart, at session scale.
- **Training focus distribution:** stacked bars per week showing how sessions split across
  focus categories, to catch "I only ever project" patterns.
- **Grade pyramid:** count of sends per grade over the selected range, boulders and routes
  separately.
- **Weekly summary strip:** sessions, total load, hardest send, days since last rest day.

**Linking to the video library**

- Days with filmed attempts show a thumbnail strip under the entry; tapping opens that
  session's clips.
- Attempt-level proximity and exertion feed the daily entry's pre-fill and give the
  insights model (2.9) a fatigue context: the same boulder attempted at session load 300 vs.
  800 is not the same attempt.
- Streak and rest-day logic: a day with no entry is "no entry", not "rest"; rest days are
  logged explicitly so the load charts stay honest.

**Reminders (mobile only):** optional end-of-day prompt to fill in the entry if an attempt was
recorded but no log exists.

---

## 3. Repository layout

The full module layout, dependency rules, and API are in [`BUILD_PLAN.md`](./BUILD_PLAN.md)
(sections 2–4). In summary:

```
climbing-coach/
  apps/
    desktop/       Electron shell for macOS (signing, notarization, Photos import addon)
    web/           React + Vite UI (home/training log, library, auto-cut review, overlay,
                   comparison, ratings); overlay rendering and hooks live here until mobile
    server/        Local Fastify API server
    cli/           `coach` CLI for processing, cutting, eval
    mobile/        React Native / Expo (Phase 5), with native frame, pose, and cutter modules
  packages/
    schema/        Domain types, PoseTrack / posebin format, label formats (the contract)
    engine/        TS: activity pass, smoothing, detection, review drafts, moves, DTW alignment,
                   comparison, stats, insights, logistic regression
    api/           API contract, `CoachApi` interface, HTTP client, conformance tests
    core/          Application services, ports, job pipelines, SQLite schema (Drizzle)
    adapters-node/ ffmpeg video tools, pose runtime, file store (desktop)
    adapters-native/ expo-sqlite, file store, native module bindings (mobile)
    test-fixtures/  config/
  research/
    pose-lab/      Python, research only: pose model bake-off and model export
    label-tool/  training/  notebooks/
  datasets/        Manifest and labels (media in private storage)
  docs/
```

---

## 4. Phases and exit criteria

### Phase 0 — Ground truth and model bake-off

- Collect 30–50 recordings (at least 120 attempts) across angles, lighting, and wall types
  (slab, vert, overhang, roof), following a capture protocol (camera placement, H.264, HDR
  off), plus a few HEVC/HDR and handheld recordings as robustness cases.
- Hand-label climb start, climb end, outcome, exit direction, and move boundaries for each
  attempt (simple labeling tool in `research/label-tool`); freeze a test split.
- Run pose models on the set; measure landmark stability on inverted/occluded frames. Test
  each candidate in the runtime it would ship in (ONNX Runtime or MediaPipe Tasks) on desktop
  and phones.
- Build one LGPL ffmpeg for macOS on Apple Silicon with VideoToolbox, check it on iPhone
  HEVC/HDR footage, and record the licensing decision (ADR-002).
- **Exit:** chosen pose model and runtime (ADR-001); evaluation script that scores start/fall
  detection and alignment on the labeled set, with confidence intervals.

### Phase 1 — Engine

- `schema` and `engine` packages (activity pass, detection, review drafts, moves, alignment),
  the pose adapter for the ADR-001 runtime, and the ffmpeg video tools in `adapters-node`
  (probing, proxies, lossless and re-encode cuts); `coach` CLI that takes a video and emits
  PoseTrack + review items + Moves, and can apply a set of climb ranges to produce clip files.
- **Exit:** the activity pass keeps at least 99% of attempts inside its active windows; start
  frame within ±0.5 s on ≥ 90% of attempts; fall recall ≥ 90% with top/fall confusion < 10%;
  synthetic-warp DTW test passes; lossless cut keeps every frame inside the requested range
  (verified by frame-hash comparison against the original).

### Phase 2 — Local standalone app (auto-cut is the core workflow)

- Import a raw recording → background processing → auto-cut review screen with draggable
  climb ranges, shaded padding, frame-step nudging, filmstrip and loupe, split/merge/reject/add,
  undo/redo, track picker, outcome, boulder selection, and optional scores → cut → clips
  appear in the library with skeleton overlay playback and the two-score rating form
  (proximity to success, exertion). Trash and bundle export/import are included.
- Homepage with the daily training log entry (session exertion, boulder/route counts, focus,
  session type, duration) pre-filled from the day's attempts, plus the training-load,
  exertion-vs-volume, focus-distribution, and grade-pyramid charts.
- **Exit:** a user can import a session recording, review and fine-tune the proposed cuts,
  produce one clip per attempt, rate them, log the day, and see the day on the homepage
  charts without touching a terminal. Over at least 5 real gym sessions, the median climb
  boundary adjustment is under 0.3 s. Ships as a signed and notarized macOS app (DMG,
  Apple Silicon) that runs on a clean Mac without Gatekeeper warnings, including Photos import.

### Phase 3 — Comparison

- Pick two attempts of one boulder → aligned side-by-side and ghost overlay, divergence
  timeline, per-move difference summary.
- **Exit:** differently paced attempts play visibly in sync; a climber can identify the
  divergent move from the UI alone.

### Phase 4 — Insights and learning loop

- Grow the labeled dataset to at least 300 attempts (dataset v2) — the first test split is
  too small to decide whether a model beats the heuristics.
- Rule-based sent-vs-failed insights; dataset export; train start/fall classifiers on
  accumulated corrections with logistic regression in TypeScript; first
  outcome/proximity/exertion model once enough attempts exist; shadow-mode promotion with
  rollback; per-user boundary offset.
- **Exit:** classifier beats heuristics on dataset v2, with confidence intervals; insights
  panel ships behind a clear "based on N attempts" caveat.

### Phase 5 — Mobile

- Spikes first: pose throughput, lossless trimming, and engine compute off the UI thread on
  reference phones (ADR-003).
- Expo app with `react-native-vision-camera` recording (H.264, HDR off by default), import
  from Photos, a native pose module running the same model and runtime chosen in ADR-001, the
  same `engine` and `core` packages, a native cutter module (AVFoundation / Media3
  Transformer), SQLite, Skia overlays, import of desktop bundles.
- iOS first, then Android (wider device variance for pose performance).
- **Exit:** record or import → auto-cut review → cut → skeleton → compare → rate works end to
  end on-device, including cutting a 5-minute 1080p recording without a full re-encode; pose
  output matches desktop within tolerance.

### Phase 6 — Optional

- Sync (iCloud/Drive or own backend), sharing comparisons with a coach, wall-space homography
  overlay, live on-wall detection while recording.
- Windows and Linux desktop builds, and Intel Macs (per-OS ffmpeg builds, signing, and
  replacements for the macOS integrations).

---

## 5. Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Pose quality on climbing-specific postures | Phase 0 bake-off; adapter boundary allows swapping models |
| No accurate pose model runs in a shippable runtime on every platform | ADR-001 tests model and runtime together; MediaPipe Tasks as the alternative to ONNX Runtime |
| Fall vs. intentional jump-off | Top-hold-dwell rule plus user confirmation; confirmations train the classifier |
| Handheld cameras | Camera-motion warning and stabilization; body-centric normalization keeps comparison robust |
| Multiple climbers in frame | Tracking plus the "Wrong climber?" track picker |
| Auto-cut trims away real climbing (false boundary) | Padding added around the climb range at cut time; keyframe snapping only expands outward; originals retained so any clip can be re-cut |
| Activity pass misses an attempt | Active windows padded ± 3 s; recall ≥ 99% as a Phase 1 gate; "Process whole recording" fallback |
| Long keyframe intervals make lossless cuts much longer than requested | `auto` cut mode re-encodes the clip (hardware encoder) when expansion exceeds 2 s; frame-hash verification test |
| HDR / HEVC phone footage is slow to process and play | Capture defaults to H.264 SDR; tone-mapping at proxy size; all playback through H.264 proxies |
| Desktop users without an Apple Silicon Mac | Mobile apps follow; the desktop stack stays cross-platform so other OSes are packaging work |
| Notarization and signing of bundled binaries (ffmpeg, native addons) | Signed in CI from Phase 0 with a notarized test app; release checks with Gatekeeper on a clean Mac |
| Sparse per-boulder data for ML | Stage A rule-based insights as primary value; set expectations in the UI |
| Mobile processing cost | Offline processing after recording; per-device model size; reduced fps (15) with interpolation |
