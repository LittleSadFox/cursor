# ADR-002: ffmpeg build and licensing

- Status: Proposed
- Date: 2026-10-15
- Deciders: Climbing Coach eng

## Context

Desktop video tools need probe, frame decode, proxies, lossless cut, thumbnails, and export.
Common static ffmpeg builds are GPL (libx264). The product target is macOS arm64 with
VideoToolbox hardware encode/decode.

## Decision

**Pending CI verification on macOS arm64.** Preferred direction:

- Ship one **LGPL** ffmpeg/ffprobe build for macOS arm64 with VideoToolbox
  (`h264_videotoolbox`, `hevc_videotoolbox`, `-allow_sw 1` for VMs)
- No third-party H.264 encoder in the app bundle
- Sign nested binaries with the hardened runtime inside the notarized app

Alternative (needs legal sign-off): GPL ffmpeg as a separate executable with a source offer.

## Alternatives considered

1. System ffmpeg (unreliable codecs / versions)
2. AVFoundation-only native addon (loses CLI/CI parity)
3. GPL static build linked into the app (licensing risk)

## Consequences

- P0.8 must prove codecs/filters on iPhone HEVC/HDR samples in macOS CI.
- Linux CI continues to use whatever ffmpeg is available only for non-shipping research helpers,
  not for packaging the desktop app.

## References

- `docs/BUILD_PLAN.md` §1.2, §5.2 P0.8
