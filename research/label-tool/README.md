# Label tool (P0.4)

Minimal temporal labeling UI for climb start/end, outcome, exit direction, and limb
placements. Labels are JSONL rows matching `TemporalLabelSchema` in `@climbing-coach/schema`.

```bash
# open locally (no build step)
python3 -m http.server 8765 --directory research/label-tool
# → http://127.0.0.1:8765/
```

Workflow: load a video file from disk (browser-only; nothing uploads). The tool hashes the
file and reuses the same video and subject ids on later visits. If you also load
`datasets/manifest.json`, a matching `sha256` fills the video id from that recording. Scrub,
mark events (hands and feet, exit top/side/bottom), undo the last mark, then download
`labels.jsonl`.

`currentTime` is not frame-accurate. Boundary labels are rounded to the nearest microsecond of
the element clock, not the next packet PTS, so they are coarser than the ±1 frame bars in
BUILD_PLAN §6.2.

Cross-attempt move correspondences and CVAT keypoint labeling remain manual until the dataset
exists.
