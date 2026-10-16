"""posebin v1 reader/writer mirroring packages/schema (BUILD_PLAN §3.4)."""

from __future__ import annotations

import json
import math
import re
import struct
from dataclasses import dataclass
from typing import Any


MAGIC = b"POSEBIN\0"
FORMAT_VERSION = 1
LANDMARK_COUNT = 33
LANDMARK_STRIDE = 4
ULID_RE = re.compile(r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$")


@dataclass
class PoseTrack:
    header: dict[str, Any]
    t_us: list[float]
    landmarks_by_track: dict[str, list[float]]


def _align8(n: int) -> int:
    return (n + 7) & ~7


def _fail(message: str) -> None:
    raise ValueError(message)


def _require_int(value: Any, label: str, *, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        _fail(f"{label} must be >= {minimum}")
    return value


def _validate_windows(windows: Any) -> list[dict[str, int]]:
    if not isinstance(windows, list):
        _fail("windows must be a list")
    parsed: list[dict[str, int]] = []
    previous_end = -1
    for index, window in enumerate(windows):
        if not isinstance(window, dict):
            _fail(f"windows[{index}] must be an object")
        start = _require_int(window.get("startUs"), f"windows[{index}].startUs", minimum=0)
        end = _require_int(window.get("endUs"), f"windows[{index}].endUs", minimum=0)
        if end < start:
            _fail(f"windows[{index}] endUs < startUs")
        if start < previous_end:
            _fail("windows must be ordered and non-overlapping")
        previous_end = end
        parsed.append({"startUs": start, "endUs": end})
    return parsed


def _validate_tracks(tracks: Any, frame_count: int) -> list[dict[str, Any]]:
    if not isinstance(tracks, list) or not tracks:
        _fail("tracks must be a non-empty list")
    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, track in enumerate(tracks):
        if not isinstance(track, dict):
            _fail(f"tracks[{index}] must be an object")
        track_id = track.get("trackId")
        if not isinstance(track_id, str) or not ULID_RE.match(track_id):
            _fail(f"tracks[{index}].trackId must be a ULID")
        if track_id in seen:
            _fail(f"duplicate trackId {track_id}")
        seen.add(track_id)
        first = _require_int(track.get("firstFrame"), f"tracks[{index}].firstFrame", minimum=0)
        last = _require_int(track.get("lastFrame"), f"tracks[{index}].lastFrame", minimum=0)
        if last < first:
            _fail(f"tracks[{index}] lastFrame < firstFrame")
        if last >= frame_count:
            _fail(f"tracks[{index}] lastFrame must be < frameCount")
        parsed.append({"trackId": track_id, "firstFrame": first, "lastFrame": last})
    return parsed


def validate_header(header: Any) -> dict[str, Any]:
    """Return a canonical header or raise ValueError."""
    if not isinstance(header, dict):
        _fail("posebin header must be an object")
    video_id = header.get("videoId")
    if not isinstance(video_id, str) or not ULID_RE.match(video_id):
        _fail("videoId must be a ULID")
    if header.get("kind") not in ("detection", "hq"):
        _fail("kind must be detection or hq")
    for key in ("runtime", "model"):
        value = header.get(key)
        if not isinstance(value, str) or not value:
            _fail(f"{key} must be a non-empty string")
    model_version = header.get("modelVersion")
    if model_version is not None and (not isinstance(model_version, str) or not model_version):
        _fail("modelVersion must be a non-empty string")
    sample_fps = header.get("sampleFps")
    if isinstance(sample_fps, bool) or not isinstance(sample_fps, (int, float)) or sample_fps <= 0:
        _fail("sampleFps must be > 0")
    if header.get("coordinateSpace") != "display":
        _fail('coordinateSpace must be "display"')
    width = _require_int(header.get("displayWidth"), "displayWidth", minimum=1)
    height = _require_int(header.get("displayHeight"), "displayHeight", minimum=1)
    if header.get("rotation") not in (0, 90, 180, 270):
        _fail("rotation must be 0, 90, 180, or 270")
    frame_count = _require_int(header.get("frameCount"), "frameCount", minimum=0)
    tracks = _validate_tracks(header.get("tracks"), frame_count)
    selected = header.get("selectedTrackId")
    if not isinstance(selected, str) or selected not in {track["trackId"] for track in tracks}:
        _fail("selectedTrackId must be one of tracks")
    canonical: dict[str, Any] = {
        "videoId": video_id,
        "kind": header["kind"],
        "runtime": header["runtime"],
        "model": header["model"],
    }
    if model_version is not None:
        canonical["modelVersion"] = model_version
    canonical.update(
        {
            "sampleFps": sample_fps,
            "windows": _validate_windows(header.get("windows")),
            "coordinateSpace": "display",
            "displayWidth": width,
            "displayHeight": height,
            "rotation": header["rotation"],
            "tracks": tracks,
            "selectedTrackId": selected,
            "frameCount": frame_count,
        }
    )
    return canonical


def _assert_timestamps(t_us: list[float], frame_count: int) -> None:
    if len(t_us) != frame_count:
        _fail(f"t_us length {len(t_us)} != frameCount {frame_count}")
    previous = -1
    for index, value in enumerate(t_us):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not float(value).is_integer():
            _fail(f"t_us[{index}] must be a non-negative integer")
        if value < 0 or value <= previous:
            _fail("t_us must be non-negative and strictly increasing")
        previous = value


def _assert_landmarks(track: PoseTrack, frame_count: int) -> None:
    expected = frame_count * LANDMARK_COUNT * LANDMARK_STRIDE
    track_ids = [ref["trackId"] for ref in track.header["tracks"]]
    if set(track.landmarks_by_track) != set(track_ids):
        _fail("landmarks_by_track must contain exactly the header tracks")
    for track_id in track_ids:
        buf = track.landmarks_by_track[track_id]
        if len(buf) != expected:
            _fail(f"track {track_id} landmark length {len(buf)} != expected {expected}")
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in buf):
            _fail(f"track {track_id} landmarks must be numbers")
        if any(math.isinf(value) for value in buf):
            _fail(f"track {track_id} landmarks must be finite or NaN")


def _landmark_bytes(count: int) -> int:
    return count * LANDMARK_COUNT * LANDMARK_STRIDE * 4


def write_posebin(track: PoseTrack) -> bytes:
    header = validate_header(track.header)
    normalized = PoseTrack(header=header, t_us=list(track.t_us), landmarks_by_track=track.landmarks_by_track)
    frame_count = header["frameCount"]
    _assert_timestamps(normalized.t_us, frame_count)
    _assert_landmarks(normalized, frame_count)

    header_json = json.dumps(header, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode(
        "utf-8"
    )
    header_len = len(header_json)
    header_end = 16 + header_len
    data_start = _align8(header_end)
    per_track = _landmark_bytes(frame_count)
    total = data_start + frame_count * 8 + len(header["tracks"]) * per_track
    out = bytearray(total)
    out[0:8] = MAGIC
    struct.pack_into("<I", out, 8, FORMAT_VERSION)
    struct.pack_into("<I", out, 12, header_len)
    out[16:header_end] = header_json
    offset = data_start
    for index, timestamp in enumerate(normalized.t_us):
        struct.pack_into("<d", out, offset + index * 8, float(timestamp))
    offset += frame_count * 8
    for ref in header["tracks"]:
        raw = struct.pack(f"<{per_track // 4}f", *normalized.landmarks_by_track[ref["trackId"]])
        if len(raw) != per_track:
            _fail("landmark pack length mismatch")
        out[offset : offset + per_track] = raw
        offset += per_track
    if offset != total:
        _fail("posebin writer size mismatch")
    return bytes(out)


def read_posebin(data: bytes) -> PoseTrack:
    if len(data) < 16:
        _fail("posebin too short")
    if data[:8] != MAGIC:
        _fail("invalid posebin magic")
    version, header_len = struct.unpack_from("<II", data, 8)
    if version != FORMAT_VERSION:
        _fail(f"unsupported posebin version {version}")
    header_end = 16 + header_len
    if header_end > len(data):
        _fail("posebin header overruns buffer")
    try:
        raw_header = json.loads(data[16:header_end].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        _fail("posebin header is not valid JSON")
        raise exc
    header = validate_header(raw_header)
    data_start = _align8(header_end)
    frame_count = header["frameCount"]
    per_track = _landmark_bytes(frame_count)
    needed = data_start + frame_count * 8 + len(header["tracks"]) * per_track
    if len(data) < needed:
        _fail(f"posebin truncated: need {needed}, have {len(data)}")
    t_us = [struct.unpack_from("<d", data, data_start + i * 8)[0] for i in range(frame_count)]
    _assert_timestamps(t_us, frame_count)
    landmarks_by_track: dict[str, list[float]] = {}
    offset = data_start + frame_count * 8
    for ref in header["tracks"]:
        count = per_track // 4
        landmarks_by_track[ref["trackId"]] = list(struct.unpack_from(f"<{count}f", data, offset))
        offset += per_track
    track = PoseTrack(header=header, t_us=t_us, landmarks_by_track=landmarks_by_track)
    _assert_landmarks(track, frame_count)
    return track
