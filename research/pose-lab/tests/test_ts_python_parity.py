"""TS ↔ Python posebin parity, including byte identity and writer validation."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from posebin import PoseTrack, read_posebin, write_posebin

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
TS_FIXTURE = FIXTURES / "from-ts.posebin"
PY_FIXTURE = FIXTURES / "from-py.posebin"
TRACK_A = "01ARZ3NDEKTSV4RRFFQ69G5FAW"
TRACK_B = "01ARZ3NDEKTSV4RRFFQ69G5FAX"
VIDEO_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"


def _nan_equal(left: float, right: float) -> bool:
    return (math.isnan(left) and math.isnan(right)) or left == right


def test_reads_typescript_fixture_and_rewrites_identical_bytes():
    assert TS_FIXTURE.is_file(), (
        f"missing {TS_FIXTURE}; run: pnpm --filter @climbing-coach/schema write-fixture"
    )
    raw = TS_FIXTURE.read_bytes()
    decoded = read_posebin(raw)
    assert decoded.header["videoId"] == VIDEO_ID
    assert decoded.header["coordinateSpace"] == "display"
    assert decoded.header["rotation"] == 90
    assert decoded.header["frameCount"] == 4
    assert [track["trackId"] for track in decoded.header["tracks"]] == [TRACK_A, TRACK_B]
    assert decoded.t_us == [0, 33_333, 2_000_000, 2_033_333]
    assert len(decoded.landmarks_by_track[TRACK_A]) == 4 * 33 * 4
    assert math.isnan(decoded.landmarks_by_track[TRACK_A][4])
    assert write_posebin(decoded) == raw


def test_python_writer_rejects_a_short_landmark_buffer():
    track = PoseTrack(
        header={
            "videoId": VIDEO_ID,
            "kind": "detection",
            "runtime": "python-ref",
            "model": "test",
            "sampleFps": 15,
            "windows": [{"startUs": 0, "endUs": 1}],
            "coordinateSpace": "display",
            "displayWidth": 1080,
            "displayHeight": 1920,
            "rotation": 0,
            "tracks": [{"trackId": TRACK_A, "firstFrame": 0, "lastFrame": 0}],
            "selectedTrackId": TRACK_A,
            "frameCount": 1,
        },
        t_us=[0],
        landmarks_by_track={TRACK_A: [0.0] * 10},
    )
    with pytest.raises(ValueError, match="landmark length"):
        write_posebin(track)


def test_python_writer_rejects_short_timestamps_and_bad_headers():
    header = {
        "videoId": VIDEO_ID,
        "kind": "detection",
        "runtime": "python-ref",
        "model": "test",
        "sampleFps": 15,
        "windows": [{"startUs": 0, "endUs": 1}],
        "coordinateSpace": "display",
        "displayWidth": 1080,
        "displayHeight": 1920,
        "rotation": 0,
        "tracks": [{"trackId": TRACK_A, "firstFrame": 0, "lastFrame": 1}],
        "selectedTrackId": TRACK_A,
        "frameCount": 2,
    }
    landmarks = {TRACK_A: [0.0] * (2 * 33 * 4)}
    with pytest.raises(ValueError, match="t_us length"):
        write_posebin(PoseTrack(header=header, t_us=[0], landmarks_by_track=landmarks))
    bad = dict(header)
    bad["coordinateSpace"] = "sensor"
    bad["videoId"] = "nope"
    with pytest.raises(ValueError):
        write_posebin(PoseTrack(header=bad, t_us=[0, 1], landmarks_by_track=landmarks))


def test_writes_python_fixture_for_typescript():
    n = 2
    landmarks = [0.25 if i % 5 else float("nan") for i in range(n * 33 * 4)]
    track = PoseTrack(
        header={
            "videoId": VIDEO_ID,
            "kind": "hq",
            "runtime": "python-ref",
            "model": "fixture",
            "sampleFps": 30,
            "windows": [{"startUs": 0, "endUs": 100_000}],
            "coordinateSpace": "display",
            "displayWidth": 1920,
            "displayHeight": 1080,
            "rotation": 180,
            "tracks": [
                {"trackId": TRACK_A, "firstFrame": 0, "lastFrame": 1},
                {"trackId": TRACK_B, "firstFrame": 0, "lastFrame": 1},
            ],
            "selectedTrackId": TRACK_B,
            "frameCount": n,
        },
        t_us=[16_000_000 + 7, 16_033_333],
        landmarks_by_track={
            TRACK_A: landmarks,
            TRACK_B: [1.0 - value if not math.isnan(value) else value for value in landmarks],
        },
    )
    raw = write_posebin(track)
    assert write_posebin(read_posebin(raw)) == raw
    FIXTURES.mkdir(parents=True, exist_ok=True)
    PY_FIXTURE.write_bytes(raw)
    assert all(_nan_equal(a, b) for a, b in zip(read_posebin(raw).landmarks_by_track[TRACK_A], landmarks))
