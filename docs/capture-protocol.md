# Capture protocol (draft)

Phase 0.3 will freeze camera placement, phone settings, and consent for the labeled dataset.
Until then, use these defaults when collecting footage for the bake-off.

## Phone settings

- Codec: **H.264** (turn HDR off; avoid Dolby Vision for the labeled set)
- Resolution: 1080p, 30 fps
- Lock exposure/focus when possible
- Keep the phone on a tripod or mat; note handheld clips separately as robustness cases

## Framing

- Whole body in frame from stand-up through landing
- Wall fills most of the frame; mat visible at the bottom when possible
- Prefer portrait for vertical problems; landscape for wide traverses

## Session notes to record

- Gym, boulder grade/color, wall angle (slab / vert / overhang / roof)
- Climber id (consent on file), lighting, camera distance/height
- Whether the recording contains multiple attempts

Media files stay in private storage; only `datasets/manifest.json` and labels are committed.
