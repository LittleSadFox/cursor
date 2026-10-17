# Pose model weights (P1.8 / ADR-001)

`manifest.json` pins RTMDet-nano + RTMPose-m Halpe-26 ONNX downloads (Apache-2.0).

Weights are **not** in git. Fetch them:

```bash
node scripts/pose/fetch-models.mjs
```

They land in `vendor/pose/models/` (gitignored). Override with `COACH_POSE_MODELS`.
