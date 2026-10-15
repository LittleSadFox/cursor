import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from posebin import PoseTrack, read_posebin, write_posebin

VIDEO_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
TRACK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"


def test_roundtrip_and_precision():
    n = 4
    landmarks = [0.0] * (n * 33 * 4)
    landmarks[0] = 0.25
    landmarks[1] = 0.5
    landmarks[4] = float("nan")
    track = PoseTrack(
        header={
            "videoId": VIDEO_ID,
            "kind": "detection",
            "runtime": "python-ref",
            "model": "test",
            "sampleFps": 15,
            "windows": [{"startUs": 0, "endUs": 100000}],
            "coordinateSpace": "display",
            "displayWidth": 1080,
            "displayHeight": 1920,
            "rotation": 0,
            "tracks": [{"trackId": TRACK_ID, "firstFrame": 0, "lastFrame": n - 1}],
            "selectedTrackId": TRACK_ID,
            "frameCount": n,
        },
        t_us=[16_000_000 + 7, 16_033_333, 16_066_666, 16_100_000],
        landmarks_by_track={TRACK_ID: landmarks},
    )
    decoded = read_posebin(write_posebin(track))
    assert decoded.header["videoId"] == VIDEO_ID
    assert decoded.t_us[0] == 16_000_000 + 7
    assert decoded.landmarks_by_track[TRACK_ID][0] == 0.25
    assert math.isnan(decoded.landmarks_by_track[TRACK_ID][4])
