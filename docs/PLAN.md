# Climbing Coach App — Build Plan

## Goal

Build an app that lets climbers record bouldering videos, document their attempts, and
analyze their movement over time. The app starts as a standalone local (desktop) application
and then moves to iOS and Android.

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
- Let the user rate each attempt so that, combined with the skeleton data, ML can learn what drove progress
- Video library where the user stores videos

Platform: standalone app on a local environment first, then iOS and Android.

---

## 1. Architecture: one engine, two shells

The hard, risky part of this app is the analysis pipeline (pose → attempt segmentation →
alignment → comparison), not the UI. The architecture keeps that pipeline portable so the
"move to iOS/Android" step is a UI port, not a rewrite.

```
┌─────────────────────────────────────────────────────────────┐
│ UI shell                                                    │
│   Local: React web app (Vite) → packaged with Tauri later   │
│   Mobile: React Native / Expo (iOS + Android)               │
├─────────────────────────────────────────────────────────────┤
│ Analysis engine (TypeScript, pure math, shared everywhere)  │
│   segmentation · alignment (DTW) · metrics · insights       │
├─────────────────────────────────────────────────────────────┤
│ Pose adapter (platform-specific, emits one JSON schema)     │
│   Local: MediaPipe Pose Landmarker (Web/WASM) or Python     │
│   iOS: MediaPipe iOS / Apple Vision · Android: MediaPipe    │
├─────────────────────────────────────────────────────────────┤
│ Storage: SQLite (metadata) + files (video, pose JSON, thumbs)│
└─────────────────────────────────────────────────────────────┘
```

Key decisions:

- **Pose extraction is the only platform-specific layer.** Everything downstream consumes a
  versioned `PoseTrack` JSON (per frame: timestamp, 33 landmarks with x/y/z/visibility). This
  contract is what makes the mobile port cheap.
- **Analysis engine in TypeScript, not Python.** DTW over ~2000 frames × ~80 features is cheap
  in JS, and TS runs unchanged on desktop (browser/Node) and mobile (Hermes). A Python notebook
  harness is used for research and evaluation in Phase 0–1, but production algorithms land in
  TS once validated.
- **React → React Native.** State, hooks, timeline math, and overlay-rendering logic are shared;
  view components are rewritten for RN. Flutter (Dart engine + Flutter desktop) is the viable
  alternative; choose RN unless the team already knows Flutter.
- **Processing is offline, after recording.** Bouldering clips are 20–90 s, so processing at
  15–30 fps after the fact is acceptable and avoids thermal/battery problems on phones. Live
  detection is a later optimization.
- **Local-first, on-device by default.** Videos of people in gyms are sensitive; no cloud
  dependency in v1.

Default pose model: MediaPipe Pose Landmarker (heavy variant, offline). Climbing is a known
weak spot for BlazePose (inverted bodies, heel hooks, occlusion by volumes, low camera angles),
so Phase 0 includes an accuracy bake-off against RTMPose and YOLOv8-pose via ONNX Runtime. The
adapter boundary means swapping models later does not touch the engine.

---

## 2. Design for each required function

### 2.1 Pose track preprocessing (foundation for everything)

- **Person selection.** Gyms have multiple people in frame. Track all detections; pick the
  climber as the track with the most motion near the wall region, with a one-tap override in
  the UI.
- **Smoothing.** One Euro filter per landmark; confidence gating (drop landmarks below a
  visibility threshold, interpolate short gaps).
- **Normalization (for comparison, not detection).** Origin at mid-hip, scale by torso length
  (mid-shoulder to mid-hip). No left/right mirroring — beta is boulder-specific.
- **Derived features.** 8 joint angles (elbow, shoulder, hip, knee × 2 sides), trunk
  inclination, hip offset from hand centroid (2D proxy for "hips in to the wall"), per-joint
  velocities.
- **Camera-motion check.** Track background features; if the phone is handheld and moving,
  warn the user and apply stabilization before detection.

### 2.2 Start detection ("climber is on the wall")

- **Floor estimate:** lowest ankle y during the initial standing segment (plus optional
  mat-edge detection).
- **Start** = first frame where both ankles are above the floor by > k × body height, hips have
  low vertical velocity for ≥ 0.5 s (established on the wall, not jumping), and both wrists
  are above shoulder height. Sit starts are handled by the ankle rule alone.
- **Multiple attempts per recording:** each start→end pair becomes an `Attempt`; rests on the
  mat are excluded.
- **Corrections become labels.** The UI shows the detected boundary with trim handles. Every
  manual correction is stored and later trains a per-frame on-wall/off-wall classifier
  (windowed pose features → gradient boosting or a small 1D-CNN) that replaces the heuristics.

### 2.3 Fall detection and attempt outcome

- End-of-attempt classifier with three outcomes: **fall**, **controlled drop/downclimb**,
  **top** (success).
- **Fall signal:** downward hip velocity normalized by body height exceeding a threshold (free
  fall approaches g; controlled downclimbing is far slower), a velocity discontinuity (sudden
  release), then ankles returning to floor level. Also handles exit-from-frame and
  end-of-video.
- **Top vs. jump-off:** both hands stationary at the attempt's highest wrist position for ≥ N
  frames before descent → top. Everything else fast → fall.
- The **fall move index** (see 2.5) is stored with the attempt so analytics can say "falls
  cluster on move 4".
- User confirms the outcome; confirmations are labels.

### 2.4 Auto-cut: detect → propose → fine-tune → cut → store

Auto-cut turns the raw recording (often several attempts plus walking around and resting) into
one trimmed clip per attempt in the library. It is the main capture workflow and is built
directly on 2.2 and 2.3.

**Pipeline**

1. **Detect.** Run pose extraction on the raw video, then start detection (2.2) and
   end-of-attempt detection (2.3) to produce candidate `[start, end]` frame pairs — one per
   attempt found in the recording.
2. **Propose.** For each candidate, generate an *auto-cut proposal*: the detected boundaries
   padded with a pre-roll (default 2 s before start, so the setup on the starting holds is
   visible) and a post-roll (default 1.5 s after the fall/top, so the landing or match on the
   finish is visible). Padding is user-configurable and clamped to the video bounds. Nothing is
   written to disk at this stage; a proposal is just metadata referencing the original.
3. **Fine-tune.** The review screen shows the raw video timeline with each proposal as a
   draggable range. Per proposal the user can:
   - drag the start and end handles with frame-step nudging (±1 frame, ±0.5 s) and a filmstrip
     of thumbnails around each handle for precision;
   - toggle a "skeleton" preview on the handle frame to confirm the climber is actually on the
     wall / actually falling;
   - split a proposal in two (detection merged two attempts), merge adjacent proposals
     (detection split one attempt), delete a false positive, or add a range the detector
     missed;
   - confirm the outcome (fall / drop / top) and pick the boulder.
4. **Cut.** On confirm, the original video is cut at the fine-tuned boundaries into one clip
   file per attempt. The cut is lossless by default (stream copy with keyframe snapping; the
   boundary is expanded outward to the nearest keyframe, never inward, so no climbing is
   lost) and falls back to a re-encode of only the head and tail GOPs when exact frame
   boundaries are required. Desktop uses `ffmpeg`; mobile uses `AVAssetExportSession` (iOS) and
   `MediaMuxer`/`MediaCodec` (Android) behind the same interface.
5. **Store.** Each clip becomes an `Attempt` in the library with its own `Video` record,
   thumbnail, and a `PoseTrack` sliced from the already-computed full-video track (no
   re-processing). The attempt stores a reference back to the original and its exact
   `[start, end]` in original-frame coordinates so the cut is reproducible and re-adjustable.

**Original video handling**

- The original is kept until the user explicitly deletes it; a "keep originals" setting
  (default: keep for 30 days, then prompt) controls storage growth.
- Re-cut is always possible from the original as long as it exists; after deletion the clip
  becomes the source of truth.

**Corrections as training data**

- Every handle adjustment is stored as a delta between the detector's proposal and the user's
  final boundary. These deltas are the labels that train the on-wall/off-wall and
  end-of-attempt classifiers in 2.2/2.3, and they also drive a per-user tuning of the pre-roll
  and post-roll defaults.

**Edge cases**

- Recording ends mid-attempt: end handle snaps to the last frame, outcome defaults to
  "unknown".
- Climber walks out of frame and back: treated as an end + new start unless the gap is shorter
  than a configurable threshold.
- No attempt detected: the user is offered the full video as a single manual range.
- Very long recordings (session-long, > 10 min): processing runs in the background with a
  progress indicator; proposals appear incrementally.

### 2.5 Move segmentation (the unit everything else needs)

- A hand move = a wrist leaving a stationary period and settling into a new one; stationary
  periods are holds. Same for feet.
- Attempts become sequences of moves. This gives climber-meaningful units for comparison
  ("move 3"), fall location, and the anchors for alignment in 2.7.

### 2.6 Skeleton view

- Render landmarks and bones on a canvas over the video (`requestVideoFrameCallback` for
  frame-accurate sync in the browser; frame-processor overlay in RN).
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

Per attempt the user records: outcome (auto-detected, confirmed), fall move, 1–5 rating,
optional structured tags (felt balanced / powerful / pumped / beta change), free notes. Stored
alongside the pose track, moves, and derived metrics.

Learning, staged:

- **Stage A — rule-based (works from the first session).** Within one boulder, compare sent vs.
  failed attempts and surface the features that differ most at the fall move.
- **Stage B — small-data ML.** Per-move feature vectors → logistic regression / gradient
  boosting with per-feature contributions (SHAP) predicting outcome and rating. Per-boulder
  data is sparse, so models train across the user's boulders on normalized features, with
  per-boulder deltas shown for interpretation.
- **Stage C — optional, opt-in.** Aggregated anonymized pose data across users for general
  technique models. Out of scope until the single-user loop proves useful.
- The start/fall correction labels from 2.2/2.3 feed their own classifiers independently.

### 2.10 Video library

- **Entities:** `Climber` (profile), `Gym`, `Boulder` (name, grade, color, set date, wall
  photo), `Session`, `Video` (file ref, camera metadata, `kind`: original | clip, and for
  clips a reference to the original plus `[start, end]` in original-frame coordinates),
  `CutProposal` (detected and fine-tuned boundaries, padding, correction deltas), `Attempt`
  (clip video, outcome, fall move, rating, notes), `PoseTrack`, `MoveSegment`, `Comparison`
  (attempt A/B, warp path, metrics).
- **Library views:** the default library lists attempts (clips), not raw recordings; originals
  live under a separate "Recordings" view with their derived clips listed beneath them and a
  "re-cut" action.
- **Storage:** SQLite for metadata (identical on desktop and mobile), files on disk for video,
  pose JSON, thumbnails. Import/export bundle (zip of DB rows + files) so desktop-processed
  data moves to the phone before sync exists.
- **Browsing:** filters by boulder, grade, outcome, date range, rating. Boulder page shows
  attempt history and progress charts.

---

## 3. Repository layout

```
climbing-coach/
  packages/
    schema/        JSON Schema + TS types for PoseTrack, Attempt, Comparison (the contract)
    engine/        TS: smoothing, segmentation, moves, DTW alignment, metrics, insights
    pose-web/      MediaPipe Web adapter → PoseTrack
    cutter/        Video cutting interface; ffmpeg (desktop), AVFoundation / MediaMuxer (mobile)
  apps/
    desktop/       React + Vite local app (library, auto-cut review, overlay, comparison, ratings)
    mobile/        React Native / Expo (Phase 5)
  research/
    harness/       Python: labeling tool, eval scripts, model bake-off
    notebooks/
  docs/
```

---

## 4. Phases and exit criteria

### Phase 0 — Ground truth and model bake-off

- Collect 30–50 clips of real attempts across angles, lighting, and wall types (slab, vert,
  overhang, roof).
- Hand-label start frame, end frame, outcome, and move boundaries for each clip (simple
  labeling tool in `research/harness`).
- Run pose models on the set; measure landmark stability on inverted/occluded frames.
- **Exit:** chosen pose model; evaluation script that scores start/fall detection and
  alignment on the labeled set.

### Phase 1 — Engine

- `schema`, `engine`, `pose-web`, `cutter` packages; CLI that takes a video and emits
  PoseTrack + cut proposals + Moves, and can apply a set of boundaries to produce clip files.
- **Exit:** start frame within ±0.5 s on ≥ 90% of clips; fall recall ≥ 90% with top/fall
  confusion < 10%; synthetic-warp DTW test passes; lossless cut keeps every frame inside the
  requested range (verified by frame-hash comparison against the original).

### Phase 2 — Local standalone app (auto-cut is the core workflow)

- Import a raw recording → background processing → auto-cut review screen with draggable
  proposals, frame-step nudging, thumbnail filmstrip, split/merge/delete/add, outcome and
  boulder selection → cut → clips appear in the library with skeleton overlay playback and a
  rating form.
- **Exit:** a user can import a session recording, review and fine-tune the proposed cuts,
  produce one clip per attempt, rate them, and browse by boulder without touching a terminal.
  Median manual adjustment per boundary on the labeled set is under 0.3 s. Package with Tauri
  if a double-clickable app is wanted.

### Phase 3 — Comparison

- Pick two attempts of one boulder → aligned side-by-side and ghost overlay, divergence
  timeline, per-move difference summary.
- **Exit:** differently paced attempts play visibly in sync; a climber can identify the
  divergent move from the UI alone.

### Phase 4 — Insights and learning loop

- Rule-based sent-vs-failed insights; dataset export; train start/fall classifiers on
  accumulated corrections; first outcome/rating model once enough attempts exist.
- **Exit:** classifier beats heuristics on the labeled set; insights panel ships behind a clear
  "based on N attempts" caveat.

### Phase 5 — Mobile

- Expo app with `react-native-vision-camera` recording, native pose adapter (MediaPipe
  iOS/Android; Apple Vision as an iOS fallback), the same `engine` package, native `cutter`
  implementations (AVFoundation / MediaMuxer), SQLite, import of desktop bundles.
- iOS first, then Android (wider device variance for pose performance).
- **Exit:** record → auto-cut review → cut → skeleton → compare → rate works end to end
  on-device, including cutting a 5-minute 1080p recording without a full re-encode.

### Phase 6 — Optional

- Sync (iCloud/Drive or own backend), sharing comparisons with a coach, wall-space homography
  overlay, live on-wall detection while recording.

---

## 5. Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Pose quality on climbing-specific postures | Phase 0 bake-off; adapter boundary allows swapping models |
| Fall vs. intentional jump-off | Top-hold-dwell rule plus user confirmation; confirmations train the classifier |
| Handheld cameras | Camera-motion warning and stabilization; body-centric normalization keeps comparison robust |
| Multiple climbers in frame | Tracking plus manual override |
| Auto-cut trims away real climbing (false boundary) | Pre/post-roll padding; keyframe snapping only expands outward; originals retained so any clip can be re-cut |
| Lossless cutting not frame-exact on all codecs/devices | Head/tail GOP re-encode fallback behind the same `cutter` interface; frame-hash verification test |
| Sparse per-boulder data for ML | Stage A rule-based insights as primary value; set expectations in the UI |
| Mobile processing cost | Offline processing after recording; per-device model size; reduced fps (15) with interpolation |
