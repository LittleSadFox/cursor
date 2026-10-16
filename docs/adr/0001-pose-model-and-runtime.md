# ADR-001: Pose model and shipped runtime

- Status: Proposed
- Date: 2026-10-15
- Deciders: Climbing Coach eng

## Context

BUILD_PLAN P0.6 / PLAN §1: pose extraction is the only platform-specific layer. Desktop and
mobile must share one `PoseTrack` contract. Climbing footage is a known weak spot (inversions,
heel hooks, occlusion, low angles). Candidates include MediaPipe Pose Landmarker and
RTMDet + RTMPose (feet keypoints); YOLO-pose is research-only (AGPL).

## Decision

**Pending bake-off.** Preferred direction if bake-off confirms accuracy and CoreML coverage:

- Model: RTMDet + RTMPose (body26 with feet), exported to ONNX
- Runtime: ONNX Runtime with CoreML EP on macOS/iOS; CPU EP in Linux CI; NNAPI/XNNPACK on Android

Fallback: MediaPipe Tasks Vision (hidden Electron window on desktop; Tasks on mobile).

Python sidecars will not ship.

## Alternatives considered

1. MediaPipe-only on all platforms
2. YOLO-pose in the shipped app (rejected: AGPL)
3. Python sidecar for pose (last resort only)

## Consequences

- Bake-off needs the P0.3 dataset and P0.5 pose-lab runners before this ADR can be Accepted.
- Adapter boundary (`adapters-node/pose`, later `adapters-native/pose`) isolates the swap.

## References

- `docs/PLAN.md` §1
- `docs/BUILD_PLAN.md` §5.2 P0.5–P0.6, §8
