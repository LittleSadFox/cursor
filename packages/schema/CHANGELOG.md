# @climbing-coach/schema

## 1.1.0 — comparison bin (P3.2)

- `writeComparisonBin` / `readComparisonBin`: `comparisons/<id>.bin` with Int32 warp times
  `[steps × 2]` (clip microseconds of A and B) and Float32 divergence `[steps × channels]`.
  Additive; posebin v1 and the label formats are unchanged.
- `slicePoseTrack`: a time slice of a pose track, for `GET /videos/:id/pose?fromUs&toUs`.

## 1.0.0 — schema v1 (P0.2)

Tagged contract for Phase 0:

- `Us`, ULID validation
- `PoseTrack` / posebin v1 (display coordinate space, Float64 `tUs`)
- signals JSON, temporal + export label JSONL
- `FeatureSpec` placeholder (`FEATURE_SPEC_PLACEHOLDER`, version `0.0.0-placeholder` — not `1.0.0`)
- `DatasetManifest` for `datasets/manifest.json` (capture fields, grouped splits, frozen test-split hash)
- Temporal labels are a discriminated union: required fields depend on `kind`
- Posebin header and timestamp invariants are enforced on write and read
- JSON Schema export under `json-schema/`

Breaking vs 0.1.0: package version and `SCHEMA_VERSION` are now `1.0.0`.

Versioning: schema versions are recorded in this changelog. Changesets (BUILD_PLAN §1.1) is not
adopted yet; that is an explicit deviation until the release pipeline needs it.
