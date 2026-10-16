# @climbing-coach/schema

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
