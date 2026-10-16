# ffmpeg verify samples (P0.8)

Public clips used by `scripts/ffmpeg/download-samples.sh` and `verify.sh`.
They are **not** the climbing dataset (`datasets/manifest.json`) and must not
be treated as iPhone recordings.

| File                 | What it proves                                            | License                  |
| -------------------- | --------------------------------------------------------- | ------------------------ |
| `media/h264-bbb.mp4` | H.264 decode, `skip_frame`, VT hwaccel attempt            | CC-BY 3.0 Big Buck Bunny |
| `media/hevc-bbb.mp4` | HEVC SDR decode, `zscale`/`tonemap`/`scale`/`framemd5`    | CC-BY 3.0 Big Buck Bunny |
| `media/dovi-p5.mp4`  | Dolby Vision Profile 5 bitstream                          | FFmpeg FATE test vector  |
| `media/dovi-p81.mp4` | Dolby Vision Profile 8.1 + HDR10 (`bt2020` / `smpte2084`) | FFmpeg FATE test vector  |

Media files are downloaded in CI (gitignored). Hashes are in `manifest.json`.

Genuine iPhone clips are **not** in this tree. Run
`./scripts/ffmpeg/verify-iphone.sh --from-store <datasets/raw>` locally.
Do not commit user footage.

## Gap: genuine iPhone clips

iPhone HEVC/HDR and Dolby Vision (typically Profile 8.4 in a `.mov`) are not
publicly redistributable here. Drop files in `iphone/` — `verify.sh` decodes
every `.mov` / `.mp4` / `.m4v` it finds.
