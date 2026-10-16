# ADR-002: ffmpeg build and licensing

- Status: Proposed
- Date: 2026-10-16
- Deciders: Climbing Coach eng

## Context

Desktop video tools (P1.7, then P2-B ingest and P3.6 export) need probe, frame
decode, proxies, lossless cut, thumbnails, and export. Common static ffmpeg
builds are GPL because they enable `libx264`. BUILD_PLAN §1.2 and §5.2 P0.8
require one **LGPL** ffmpeg/ffprobe for macOS arm64 with VideoToolbox, signed
with the hardened runtime inside a notarized app. AGENTS.md forbids shipping a
GPL ffmpeg without an accepted ADR.

v1 does not ship Windows, Linux, or Intel Mac builds (Phase 6). Linux CI still
needs a locator fallback so developers can poke at files without VideoToolbox.

## Decision

**Pending a green macos-14 verify job plus dummy-app signing.** Preferred
direction, now wired in-tree:

- Compile **FFmpeg 8.1.3** ("Hoare") and **zimg 3.0.5** (for `zscale`) in GitHub
  Actions on `macos-14` (arm64).
- License: **LGPL-2.1-or-later**. Static `ffmpeg` / `ffprobe` so P2-D signs two
  nested executables. The build script, pinned tarball hashes, and
  `BUILD.json` are the relink/rebuild offer.
- VideoToolbox is forced on (`--enable-videotoolbox`). Encode uses
  `h264_videotoolbox` / `hevc_videotoolbox`, including `-allow_sw 1` on VMs.
- `adapters-node` locates `vendor/ffmpeg/darwin-arm64/bin/{ffmpeg,ffprobe}`, or
  `COACH_FFMPEG` / `COACH_FFMPEG_DIR`. On Linux only, `PATH` is a non-shipping
  fallback. Darwin never picks Homebrew ffmpeg (usually GPL).

### Configure flags

From `scripts/ffmpeg/configure-lgpl.sh`:

```
--disable-gpl
--disable-version3
--disable-nonfree
--enable-static
--disable-shared
--disable-debug
--disable-doc
--disable-ffplay
--enable-ffmpeg
--enable-ffprobe
--enable-videotoolbox
--enable-libzimg
--enable-neon
--pkg-config-flags=--static
```

Plus `--prefix`, `--extra-cflags`, `--extra-ldflags` for the static zimg
prefix, and `MACOSX_DEPLOYMENT_TARGET=13.0`.

Explicitly **not** passed: `--enable-gpl`, `--enable-nonfree`,
`--enable-libx264`, `--enable-libx265`, `--enable-libfdk-aac`.

### License conclusion

This configuration stays on FFmpeg's default LGPL-2.1+ codepaths. zimg is
WTFPL and is statically linked only to provide `zscale`. No GPL filter, no
x264, no fdk-aac, no `--enable-version3`. Shipping is therefore LGPL, not GPL.

The GPL alternative (separate executable + source offer) is rejected unless
VideoToolbox cannot cover a required encode. That would need a new decision.

## Verified vs deferred

| Check                                                  | This slice                                                                                          | Accepted only after                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| LGPL configure, no libx264                             | Script + unit test on Linux; full banner check on macos-14                                          | macos-14 `verify.sh` green                              |
| `h264` / `hevc` software decode                        | Public BBB excerpts (CC-BY 3.0)                                                                     | macos-14                                                |
| `skip_frame`, `scale`, `zscale`, `tonemap`, `framemd5` | Filter graph on public HEVC SDR + synthetic HDR tags                                                | macos-14                                                |
| Dolby Vision bitstream                                 | FATE `dovi-p5.mp4` (P5) and `dovi-p81.mp4` (P8.1 + HDR10 `bt2020`/`smpte2084`). Not iPhone packing. | macos-14                                                |
| `h264_videotoolbox` with and without `allow_sw`        | Encode `lavfi` testsrc on macos-14                                                                  | macos-14 (soft-fail `allow_sw=0` on VMs)                |
| HEVC/H.264 **hardware** decode                         | Attempted via `-hwaccel videotoolbox`; soft-fail on hosted VMs                                      | Self-hosted M1 or user Mac                              |
| Genuine iPhone HEVC/HDR                                | Hook: `datasets/ffmpeg-samples/iphone/`                                                             | User-supplied clips                                     |
| Genuine iPhone Dolby Vision                            | Same hook (phone is often profile 8.4)                                                              | User-supplied clips                                     |
| Hardened runtime + notarized dummy app                 | `scripts/ffmpeg/sign-dummy-app.sh`                                                                  | `APPLE_DEVELOPER_ID_P12` + notary API secrets in GitHub |

Until every hard P0.8 check has actually run, this ADR stays **Proposed**.
Do not mark Accepted because the scripts exist.

## Alternatives considered

1. System / Homebrew ffmpeg — codec and license drift; usually GPL.
2. evermeet.cx / BtbN static builds — GPL (`libx264`).
3. AVFoundation-only native addon — loses CLI/CI parity with `coach`.
4. GPL static build linked into the app — licensing risk; rejected.
5. GPL helper as a separate process with a source offer — needs legal sign-off.

## Consequences

- P1.7 video tools consume `vendor/ffmpeg/darwin-arm64` (CI artifact) through
  `locateFfmpeg()`. They are not implemented in this slice.
- `/health` stays `degraded` until the pose runtime (ADR-001) also ships.
  `ffmpeg.available` becomes true only for the bundled prefix or an explicit
  `COACH_FFMPEG` override, never for a Linux PATH binary.
- Comparison export still returns `NOT_IMPLEMENTED` (P3.6) once ffmpeg is
  located; it no longer hides behind `FFMPEG_UNAVAILABLE` on a Mac that has
  the CI prefix.
- Linux developers keep using system ffmpeg only as a documented fallback.

## References

- `docs/PLAN.md` §1
- `docs/BUILD_PLAN.md` §1.2, §5.2 P0.8
- `scripts/ffmpeg/README.md`
- `datasets/ffmpeg-samples/README.md`
