# Pose lab (Python)

Phase 0 bake-off harness (P0.5–P0.6). Writes posebin for the dataset and scores PCK.
The TypeScript posebin reader/writer in `@climbing-coach/schema` is the contract.

## Layout

| Path | Purpose |
| --- | --- |
| `posebin.py` | posebin v1 read/write (parity with TS) |
| `tests/` | Python round-trip + TS→Python fixture parity |
| `fixtures/` | Generated `from-ts.posebin` (CI / `pnpm --filter @climbing-coach/schema write-fixture`) |
| `backends/` | Placeholders for MediaPipe / RTMPose / YOLO runners (P0.5) |

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pnpm --filter @climbing-coach/schema build
pnpm --filter @climbing-coach/schema write-fixture
pytest tests -q
```

Bake-off and ADR-001 acceptance need the P0.3 dataset in private storage.
