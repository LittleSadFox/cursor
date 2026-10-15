"""Minimal posebin reader/writer mirroring packages/schema (BUILD_PLAN §3.4)."""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from typing import Any


MAGIC = b"POSEBIN\0"
FORMAT_VERSION = 1
LANDMARK_COUNT = 33
LANDMARK_STRIDE = 4


def _align8(n: int) -> int:
    return (n + 7) & ~7


@dataclass
class PoseTrack:
    header: dict[str, Any]
    t_us: list[float]
    landmarks_by_track: dict[str, list[float]]


def write_posebin(track: PoseTrack) -> bytes:
    header_json = json.dumps(track.header, separators=(",", ":")).encode("utf-8")
    header_len = len(header_json)
    header_end = 16 + header_len
    data_start = _align8(header_end)
    n = track.header["frameCount"]
    t_bytes = n * 8
    per_track = n * LANDMARK_COUNT * LANDMARK_STRIDE * 4
    total = data_start + t_bytes + len(track.header["tracks"]) * per_track
    out = bytearray(total)
    out[0:8] = MAGIC
    struct.pack_into("<I", out, 8, FORMAT_VERSION)
    struct.pack_into("<I", out, 12, header_len)
    out[16:header_end] = header_json
    offset = data_start
    for i, t in enumerate(track.t_us):
        struct.pack_into("<d", out, offset + i * 8, t)
    offset += t_bytes
    for ref in track.header["tracks"]:
        buf = track.landmarks_by_track[ref["trackId"]]
        raw = struct.pack(f"<{len(buf)}f", *buf)
        out[offset : offset + per_track] = raw
        offset += per_track
    return bytes(out)


def read_posebin(data: bytes) -> PoseTrack:
    if data[:8] != MAGIC:
        raise ValueError("invalid posebin magic")
    version, header_len = struct.unpack_from("<II", data, 8)
    if version != FORMAT_VERSION:
        raise ValueError(f"unsupported posebin version {version}")
    header_end = 16 + header_len
    header = json.loads(data[16:header_end].decode("utf-8"))
    data_start = _align8(header_end)
    n = header["frameCount"]
    t_us = [
        struct.unpack_from("<d", data, data_start + i * 8)[0] for i in range(n)
    ]
    per_track = n * LANDMARK_COUNT * LANDMARK_STRIDE * 4
    offset = data_start + n * 8
    landmarks_by_track: dict[str, list[float]] = {}
    for ref in header["tracks"]:
        count = per_track // 4
        landmarks_by_track[ref["trackId"]] = list(
            struct.unpack_from(f"<{count}f", data, offset)
        )
        offset += per_track
    return PoseTrack(header=header, t_us=t_us, landmarks_by_track=landmarks_by_track)
