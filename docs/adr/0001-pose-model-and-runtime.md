# ADR-001: Pose model and shipped runtime

- Status: Accepted (provisional)
- Date: 2026-10-17
- Deciders: Climbing Coach eng

## Context

BUILD_PLAN P0.6 / PLAN §1: pose extraction is the only platform-specific layer. Desktop and
mobile must share one `PoseTrack` contract. Climbing footage is a known weak spot (inversions,
heel hooks, occlusion, low angles). Candidates include MediaPipe Pose Landmarker and
RTMDet + RTMPose (feet keypoints); YOLO-pose is research-only (AGPL).

The full P0.3 climbing bake-off dataset is not ready. The product owner asked for a provisional
shipped choice so P1.8 can land on top of P1.7 video tools: RTMPose-m (Halpe-26) + RTMDet-nano
on `onnxruntime-node`, CoreML EP on macOS arm64, CPU elsewhere. No AGPL/GPL models or runtimes.

## Decision

**Provisional Accepted** for desktop v1 (macOS arm64) and Linux CI:

| Piece | Choice | License |
| --- | --- | --- |
| Pose | RTMPose-m Halpe-26 (256×192 SimCC ONNX) | Apache-2.0 (MMPose / OpenMMLab) |
| Detector | RTMDet-nano person (320×320 ONNX, baked-in NMS) | Apache-2.0 (MMDetection / OpenMMLab) |
| Runtime | `onnxruntime-node` | MIT |
| macOS arm64 EP | CoreMLExecutionProvider (CPU fallback if CoreML rejects the graph) | — |
| Linux CI EP | CPUExecutionProvider | — |

Weights are fetched with checksum verification (`scripts/pose/fetch-models.mjs`); they are not
committed. Manifest: `vendor/pose/manifest.json`.

Halpe-26 is preferred over COCO-17 because heels and toes map into the BlazePose 33-point
contract the engine already uses. A usable Halpe-26 ONNX export exists
(`…halpe26_700e-256x192-4d3e73dd_20230605.zip`); COCO-17 fallback was not required.

Person detection runs top-down with IoU tracking and detector reuse every N frames so RTMDet
does not run on every sample.

Fallback (not selected): MediaPipe Tasks Vision in a hidden Electron window. Python sidecars
will not ship. YOLO-pose remains research-only (AGPL).

## Alternatives considered

1. MediaPipe-only on all platforms — deferred; harder CLI/CI parity and weaker feet coverage.
2. YOLO-pose in the shipped app — rejected: AGPL.
3. Python sidecar for pose — last resort only.
4. RTMPose COCO-17 — available, but loses heel/toe channels climbing needs; Halpe-26 ONNX works.

## Consequences

- `/health` reports `pose.available` from checksum-verified weights; status stays `degraded`
  until both ffmpeg and pose are ready.
- Import jobs gain a `pose-detection` step (resource class `pose`) after probe, parallel with
  proxy; SSE `job.progress` already covers it.
- CoreML operator coverage and climbing PCK are still unproven on the private dataset — this
  ADR can move back to Proposed or change model if bake-off (P0.6) fails the gates.
- Adapter boundary: `packages/adapters-node/src/pose` (later `adapters-native/pose`).

## References

- `docs/PLAN.md` §1
- `docs/BUILD_PLAN.md` §5.2 P0.5–P0.6, §5.3 P1.8, §8
- `vendor/pose/manifest.json`
