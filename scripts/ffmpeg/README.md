# LGPL ffmpeg for macOS arm64 (P0.8)

Shipped desktop video tools use **one** ffmpeg/ffprobe we compile ourselves.
Common static builds are GPL (`libx264`). This tree builds **LGPL** binaries with
VideoToolbox instead (`h264_videotoolbox`, `hevc_videotoolbox`, hardware decode).

Run these only on **macOS 13+ Apple Silicon**. Linux cannot produce the shipping
build (no VideoToolbox). `adapters-node` will look for the CI prefix, then
`COACH_FFMPEG` / `COACH_FFPROBE`, and on Linux only a documented PATH fallback.

## Commands

```bash
./scripts/ffmpeg/build-macos-arm64.sh   # prefix: vendor/ffmpeg/darwin-arm64
./scripts/ffmpeg/download-samples.sh    # public H.264 / HEVC / Dolby Vision
./scripts/ffmpeg/verify.sh              # codecs, filters, framemd5, VT encode
./scripts/ffmpeg/package.sh             # tarball for P1.7
./scripts/ffmpeg/sign-dummy-app.sh      # no-op unless Apple secrets are set
```

Pinned versions live in `versions.env`. Configure flags live in `configure-lgpl.sh`.
Forbidden flags: `--enable-gpl`, `--enable-nonfree`, `--enable-libx264` (and other
GPL/nonfree encoders).

## Locator

1. `COACH_FFMPEG` + optional `COACH_FFPROBE` (sibling `ffprobe` if omitted)
2. `COACH_FFMPEG_DIR` (`bin/ffmpeg` or `ffmpeg` in that directory)
3. `vendor/ffmpeg/darwin-arm64/bin/{ffmpeg,ffprobe}` on darwin-arm64
4. Linux only: `ffmpeg` / `ffprobe` on `PATH` as a non-shipping fallback

## iPhone clips (opt-in, not CI)

Public samples cover H.264, HEVC SDR, and FATE Dolby Vision P5 / P8.1 (PQ).
They are not iPhone recordings. Genuine iPhone 16 Pro Max clips in this project
are HEVC Main 10, HLG (`arib-std-b67`), Dolby Vision 8.4, portrait (−90°),
~60 fps VFR, plus AAC + Apple `apac`. CI cannot see that private store.

```bash
./scripts/ffmpeg/verify-iphone.sh --from-store /path/to/datasets/raw
```

P1.7 importer must map `0:v:0` and optional `0:a:0` (AAC). `-map 0` / `-map 0:a`
fails on `apac`. See `datasets/ffmpeg-samples/iphone/README.md`. Do not commit
user footage without asking.

Still missing: SDR (HDR off), 1080p30, landscape.
