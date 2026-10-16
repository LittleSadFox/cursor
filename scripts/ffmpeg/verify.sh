#!/usr/bin/env bash
# Verify the CI-built LGPL ffmpeg on the codecs/filters P0.8 needs.
# Hardware decode is a soft check on GitHub-hosted VMs (VideoToolbox may be software-only).
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_versions

FFMPEG_BIN="${COACH_FFMPEG:-$(vendor_prefix)/bin/ffmpeg}"
FFPROBE_BIN="${COACH_FFPROBE:-$(vendor_prefix)/bin/ffprobe}"
MEDIA="${SAMPLES_DIR:-$(samples_media_dir)}"
IPHONE="$(iphone_samples_dir)"
REPORT="${VERIFY_REPORT:-$(vendor_prefix)/VERIFY.md}"
WORKDIR="${VERIFY_WORKDIR:-$(vendor_prefix)/verify-scratch}"
SOFT_FAILS=0

mkdir -p "$(dirname "$REPORT")" "$WORKDIR"

require_bin() {
  local path="$1"
  if [[ ! -x "$path" ]]; then
    echo "missing executable: $path" >&2
    exit 1
  fi
}

has_line() {
  local needle="$1"
  grep -F -q -- "$needle"
}

record() {
  printf -- '- %s\n' "$*" | tee -a "$REPORT"
}

soft() {
  SOFT_FAILS=$((SOFT_FAILS + 1))
  record "SOFT: $*"
}

require_bin "$FFMPEG_BIN"
require_bin "$FFPROBE_BIN"

: >"$REPORT"
record "ffmpeg: $FFMPEG_BIN"
record "ffprobe: $FFPROBE_BIN"
record "triple: $FFMPEG_TRIPLE (host $(uname -s)/$(uname -m))"

VERSION_TEXT="$("$FFMPEG_BIN" -hide_banner -version)"
printf '%s\n' "$VERSION_TEXT" | head -n 4 | tee -a "$REPORT"

if printf '%s\n' "$VERSION_TEXT" | grep -E -- '--enable-gpl|--enable-nonfree|--enable-libx264|--enable-libx265|--enable-libfdk-aac' >/dev/null; then
  echo "ffmpeg banner contains a forbidden configure flag" >&2
  printf '%s\n' "$VERSION_TEXT" >&2
  exit 1
fi
if ! printf '%s\n' "$VERSION_TEXT" | grep -F -- '--disable-gpl' >/dev/null; then
  echo "ffmpeg banner is missing --disable-gpl" >&2
  exit 1
fi
if ! printf '%s\n' "$VERSION_TEXT" | grep -F -- '--enable-videotoolbox' >/dev/null; then
  echo "ffmpeg banner is missing --enable-videotoolbox" >&2
  exit 1
fi
if ! printf '%s\n' "$VERSION_TEXT" | grep -F -- '--enable-libzimg' >/dev/null; then
  echo "ffmpeg banner is missing --enable-libzimg (zscale)" >&2
  exit 1
fi
record "LGPL configure flags present; GPL/nonfree/libx264 absent"

ENCODERS="$("$FFMPEG_BIN" -hide_banner -encoders)"
DECODERS="$("$FFMPEG_BIN" -hide_banner -decoders)"
FILTERS="$("$FFMPEG_BIN" -hide_banner -filters)"
MUXERS="$("$FFMPEG_BIN" -hide_banner -muxers)"
HWACCELS="$("$FFMPEG_BIN" -hide_banner -hwaccels)"

require_token() {
  local haystack="$1" token="$2"
  if ! printf '%s\n' "$haystack" | grep -E "[[:space:]]${token}[[:space:]]" >/dev/null; then
    echo "missing ${token} in ffmpeg listing" >&2
    exit 1
  fi
}

require_token "$ENCODERS" h264_videotoolbox
require_token "$ENCODERS" hevc_videotoolbox
require_token "$DECODERS" h264
require_token "$DECODERS" hevc
require_token "$FILTERS" scale
require_token "$FILTERS" zscale
require_token "$FILTERS" tonemap
require_token "$MUXERS" framemd5
if ! printf '%s\n' "$HWACCELS" | has_line videotoolbox; then
  echo "videotoolbox missing from -hwaccels" >&2
  exit 1
fi
record "encoders/decoders/filters/muxers/hwaccels listed (VT + zscale + tonemap + framemd5)"

# shellcheck source=iphone-checks.sh
source "$(scripts_ffmpeg_dir)/iphone-checks.sh"

need_sample() {
  local name="$1"
  if [[ ! -f "$MEDIA/$name" ]]; then
    echo "missing sample $MEDIA/$name (run scripts/ffmpeg/download-samples.sh)" >&2
    exit 1
  fi
}

need_sample h264-bbb.mp4
need_sample hevc-bbb.mp4
need_sample dovi-p5.mp4
need_sample dovi-p81.mp4

decode_mapped_video h264-sw "$MEDIA/h264-bbb.mp4"
"$FFMPEG_BIN" -hide_banner -y -skip_frame nokey -i "$MEDIA/h264-bbb.mp4" -map 0:v:0 -an \
  -frames:v 8 -f framemd5 "$WORKDIR/h264-skip-nokey.framemd5"
record "decode h264-skip-nokey (−skip_frame nokey, −map 0:v:0) → framemd5"
decode_mapped_video hevc-sw "$MEDIA/hevc-bbb.mp4"
decode_mapped_video dovi-p5 "$MEDIA/dovi-p5.mp4"
decode_mapped_video dovi-p81 "$MEDIA/dovi-p81.mp4"

"$FFMPEG_BIN" -hide_banner -y -i "$MEDIA/hevc-bbb.mp4" -map 0:v:0 -an -frames:v 4 \
  -vf 'zscale=w=160:h=90:f=bilinear,scale=160:90,format=yuv420p' \
  -f framemd5 "$WORKDIR/scale.framemd5"
record "zscale + scale + framemd5 on public HEVC SDR"

p81_tin="$(hdr_zscale_tin "$(probe_v "$MEDIA/dovi-p81.mp4" color_transfer)")"
if [[ -z "$p81_tin" ]]; then
  echo "FATE dovi-p81 has no HDR transfer; cannot run tonemap" >&2
  exit 1
fi
tonemap_mapped_video dovi-p81 "$MEDIA/dovi-p81.mp4" "$p81_tin"
record "zscale + tonemap + scale on FATE dovi-p81 (probed tin=$p81_tin; not an iPhone clip)"

if "$FFMPEG_BIN" -hide_banner -y -hwaccel videotoolbox -i "$MEDIA/h264-bbb.mp4" -map 0:v:0 -an -frames:v 4 \
  -f framemd5 "$WORKDIR/h264-vt.framemd5"; then
  record "H.264 VideoToolbox hwaccel decode succeeded"
else
  soft "H.264 VideoToolbox hwaccel decode failed (common on GitHub-hosted VMs); software decode already passed"
fi

if "$FFMPEG_BIN" -hide_banner -y -hwaccel videotoolbox -i "$MEDIA/hevc-bbb.mp4" -map 0:v:0 -an -frames:v 4 \
  -f framemd5 "$WORKDIR/hevc-vt.framemd5"; then
  record "HEVC VideoToolbox hwaccel decode succeeded"
else
  soft "HEVC VideoToolbox hwaccel decode failed (common on GitHub-hosted VMs); software decode already passed"
fi

encode_vt() {
  local label="$1"
  shift
  local out="$WORKDIR/${label}.mp4"
  if "$FFMPEG_BIN" -hide_banner -y -f lavfi -i testsrc=size=320x240:rate=24:duration=1 "$@" "$out"; then
    record "encode $label succeeded ($(ls -lh "$out" | awk '{print $5}'))"
    return 0
  fi
  return 1
}

if ! encode_vt h264-videotoolbox-no-sw -c:v h264_videotoolbox -allow_sw 0; then
  soft "h264_videotoolbox allow_sw=0 failed (likely no hardware encoder on this VM)"
fi
if ! encode_vt h264-videotoolbox-allow-sw -c:v h264_videotoolbox -allow_sw 1; then
  echo "h264_videotoolbox -allow_sw 1 failed" >&2
  exit 1
fi

if encode_vt hevc-videotoolbox -c:v hevc_videotoolbox -allow_sw 1 \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc; then
  trc="$("$FFPROBE_BIN" -hide_banner -v error -select_streams v:0 \
    -show_entries stream=color_transfer -of csv=p=0 "$WORKDIR/hevc-videotoolbox.mp4" || true)"
  if [[ "$trc" == *smpte2084* ]]; then
    tonemap_mapped_video synthetic-vt-hevc "$WORKDIR/hevc-videotoolbox.mp4" smpte2084
    record "hevc_videotoolbox kept HDR10 tags; tonemap ran"
  else
    record "hevc_videotoolbox allow_sw=1 encoded, but macos-14 VT dropped HDR10 tags (trc=${trc:-unset}); zscale/tonemap already verified on FATE dovi-p81"
  fi
else
  soft "hevc_videotoolbox encode failed; decode/filter checks already used public HEVC"
fi

if ! run_iphone_clip_checks "$IPHONE"; then
  record "CI does not have the private iPhone originals. Local: ./scripts/ffmpeg/verify-iphone.sh --from-store <datasets/raw>"
fi

record "soft failures: $SOFT_FAILS"
log "verify report: $REPORT"
if [[ "$SOFT_FAILS" -gt 0 ]]; then
  log "completed with $SOFT_FAILS soft (environment) failures; hard checks passed"
fi
