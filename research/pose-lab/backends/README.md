# Pose backends (P0.5)

Planned runners (not implemented until dataset media is available):

1. **MediaPipe** Pose Landmarker — lite / full / heavy
2. **RTMDet + RTMPose** body26 (feet) → ONNX export for ADR-001
3. **YOLO-pose** — research comparison only (AGPL; never ship)

Each backend should: detect+track people (IoU), map landmarks into the 33-point BlazePose
layout, and write posebin via `posebin.py`.
