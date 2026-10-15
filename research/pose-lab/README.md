# Pose lab (Python)

Phase 0 bake-off: MediaPipe, RTMDet + RTMPose, YOLO-pose (research only). Writes posebin for
the dataset and scores PCK. The TypeScript posebin reader/writer in `@climbing-coach/schema`
is the contract; a round-trip test lives in `tests/test_posebin_roundtrip.py`.

Install (when starting P0.5):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
