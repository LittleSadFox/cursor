# User iPhone clips (local / opt-in — not CI)

GitHub Actions cannot read the private store. **Do not commit user footage**
(GPS is embedded; faces are identifiable). Ask before adding any excerpt to git.

`verify.sh` picks up every `*.mov` / `*.MOV` / `*.mp4` / `*.m4v` in this folder
(case-insensitive). CI leaves it empty and records DEFERRED.

## Local command

Originals live outside git. `IMG_7907.mov` may be split into `.part-*` files.

```bash
# After a Mac LGPL build, or with any ffmpeg that has zscale:
./scripts/ffmpeg/verify-iphone.sh --from-store /path/to/datasets/raw

# Or copy ready clips (including IMG_7891.MOV) into a temp dir:
IPHONE_SAMPLES_DIR=/tmp/iphone-verify ./scripts/ffmpeg/verify-iphone.sh
```

That run must: map `0:v:0` (never `-map 0` / `0:a` — `apac` fails), decode with
`-fps_mode vfr`, HLG (`arib-std-b67`) or PQ (`smpte2084`) tonemap from ffprobe,
and check autorotate on a −90° display matrix.

## Still missing

- SDR (HDR off; H.264 "Most Compatible" and/or HEVC SDR)
- 1080p30 (the labeled-set default)
- landscape
