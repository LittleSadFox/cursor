# Capture protocol v0.1

Version used by `datasets/manifest.json` → `captureProtocolVersion: "0.1"`.
P0.3 freezes this document together with a hashed test split once real media exists in
private storage. Media files are **never** committed to git.

## Goals

Collect 30–50 gym recordings (≥ 120 attempts) across wall angles, lighting, and camera
positions, with ≥ 3 climbers and signed consent, so Phase 0 bake-off and Phase 1 detector
tuning share one frozen test split (30%).

## Phone settings (labeled set)

| Setting | Value |
| --- | --- |
| Codec | **H.264** (HDR off; avoid Dolby Vision for the labeled set) |
| Resolution / fps | 1080p, 30 fps |
| Stabilization | Off if it crops unpredictably; prefer a locked tripod |
| Exposure / focus | Lock when possible |
| Audio | Not required |

Robustness extras (few clips, flagged in the manifest): HEVC, HDR, handheld / panning.

## Camera placement

1. Tripod or mat mount, 2–4 m from the wall, height ~1–1.5 m.
2. Whole body in frame from stand-up through landing; mat visible at the bottom when possible.
3. Wall fills most of the frame; avoid extreme low angles that hide hips.
4. Portrait for vertical problems; landscape for wide traverses.
5. One recording per boulder session segment is fine; mark multi-attempt clips in notes.

## Session metadata (required per recording)

- Gym name, boulder grade/color, wall angle (`slab` / `vert` / `overhang` / `roof`)
- Climber id (must match a consent record)
- Lighting notes, camera distance/height, handheld flag
- Approximate attempt count
- Consent id

## Consent

Use `datasets/consent-template.md`. Store signed forms in private storage; only `consentId`
strings appear in `datasets/manifest.json`.

## Manifest and splits

1. Compute `sha256` of each media file; set `mediaPath` relative to the private root.
2. Assign `split`: `train` / `dev` / `test` with `testSplitRatio ≈ 0.3` of *recordings*
   (not attempts). Freeze hashes before detector tuning — set `frozen: true`.
3. Validate with `@climbing-coach/schema` `DatasetManifestSchema`.

## Checklist before freeze

- [ ] ≥ 30 recordings, ≥ 120 attempts
- [ ] All four wall angles represented
- [ ] ≥ 3 climbers with consent ids
- [ ] A few handheld and HEVC/HDR robustness clips tagged
- [ ] Test split ~30%, hashes recorded, `frozen: true`
