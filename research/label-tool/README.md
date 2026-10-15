# Label tool (P0.4)

Minimal temporal labeling UI for climb start/end, outcome, exit direction, and limb
placements. Labels are JSONL rows matching `TemporalLabelSchema` in `@climbing-coach/schema`.

```bash
# open locally (no build step)
python3 -m http.server 8765 --directory research/label-tool
# → http://127.0.0.1:8765/
```

Workflow: load a video file from disk (browser-only; nothing uploads), scrub, mark events,
download `labels.jsonl`. Cross-attempt move correspondences and CVAT keypoint labeling remain
manual / external until the dataset exists.
