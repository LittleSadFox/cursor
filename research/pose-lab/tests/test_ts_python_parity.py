"""Read the posebin written by TypeScript (packages/schema) and check parity."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from posebin import read_posebin, write_posebin

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "from-ts.posebin"
TRACK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"


def test_reads_typescript_fixture():
    assert FIXTURE.is_file(), (
        f"missing {FIXTURE}; run: pnpm --filter @climbing-coach/schema write-fixture"
    )
    decoded = read_posebin(FIXTURE.read_bytes())
    assert decoded.header["videoId"] == "01ARZ3NDEKTSV4RRFFQ69G5FAV"
    assert decoded.header["coordinateSpace"] == "display"
    assert decoded.t_us[0] == 16_000_000 + 7
    assert decoded.landmarks_by_track[TRACK_ID][0] == pytest.approx(0.42, abs=1e-6)
    assert math.isnan(decoded.landmarks_by_track[TRACK_ID][4])


def test_python_rewrite_preserves_precision():
    original = read_posebin(FIXTURE.read_bytes())
    again = read_posebin(write_posebin(original))
    assert again.t_us == original.t_us
    assert again.header["frameCount"] == original.header["frameCount"]
