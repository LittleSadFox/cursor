#!/usr/bin/env bash
# Opt-in iPhone HEVC/HLG/Dolby Vision checks. Not run in GitHub CI (private store).
# Uses COACH_FFMPEG or ffmpeg on PATH — does not require the LGPL VideoToolbox build.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Verify genuine iPhone clips (HLG / Dolby Vision 8.4 / portrait / VFR / apac).

CI cannot see the private originals. Do not commit user footage.

  # Directory of ready .MOV / .mov files:
  IPHONE_SAMPLES_DIR=/path/to/clips ./scripts/ffmpeg/verify-iphone.sh

  # Raw store (may contain IMG_7907.mov.part-00 …); reassembles into a temp dir:
  ./scripts/ffmpeg/verify-iphone.sh --from-store /path/to/datasets/raw

Rejoin parts yourself if you prefer:

  cat IMG_7907.mov.part-00 IMG_7907.mov.part-01 IMG_7907.mov.part-02 > /tmp/iphone/IMG_7907.mov
  cp IMG_7891.MOV /tmp/iphone/
  IPHONE_SAMPLES_DIR=/tmp/iphone ./scripts/ffmpeg/verify-iphone.sh

Still missing from the user: SDR (HDR off), 1080p30, landscape.
EOF
}

STORE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --from-store)
      STORE="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${COACH_FFMPEG:-}" ]]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    COACH_FFMPEG="$(command -v ffmpeg)"
    COACH_FFPROBE="$(command -v ffprobe)"
  fi
fi
FFMPEG_BIN="${COACH_FFMPEG:-}"
FFPROBE_BIN="${COACH_FFPROBE:-${COACH_FFMPEG%ffmpeg}ffprobe}"
if [[ ! -x "$FFMPEG_BIN" || ! -x "$FFPROBE_BIN" ]]; then
  echo "need ffmpeg/ffprobe (set COACH_FFMPEG or install a local build)" >&2
  exit 1
fi

WORKDIR="${VERIFY_WORKDIR:-$(mktemp -d /tmp/coach-iphone-verify.XXXXXX)}"
REPORT="${VERIFY_REPORT:-$WORKDIR/VERIFY-IPHONE.md}"
mkdir -p "$WORKDIR" "$(dirname "$REPORT")"
: >"$REPORT"

record() {
  printf -- '- %s\n' "$*" | tee -a "$REPORT"
}

# shellcheck source=iphone-checks.sh
source "$(scripts_ffmpeg_dir)/iphone-checks.sh"

CLIPS_DIR="${IPHONE_SAMPLES_DIR:-}"
cleanup_clips=""
if [[ -n "$STORE" ]]; then
  if [[ ! -d "$STORE" ]]; then
    echo "store directory not found: $STORE" >&2
    exit 1
  fi
  CLIPS_DIR="$(mktemp -d /tmp/coach-iphone-clips.XXXXXX)"
  cleanup_clips="$CLIPS_DIR"
  if [[ -f "$STORE/IMG_7907.mov.part-00" ]]; then
    cat "$STORE"/IMG_7907.mov.part-* >"$CLIPS_DIR/IMG_7907.mov"
    record "rejoined IMG_7907.mov from parts in $STORE"
  fi
  local_copy=0
  while IFS= read -r src; do
    [[ -f "$src" ]] || continue
    dest="$CLIPS_DIR/$(basename "$src")"
    if [[ ! -e "$dest" ]]; then
      cp "$src" "$dest"
    fi
    local_copy=1
  done < <(list_iphone_clips "$STORE")
  if [[ "$local_copy" -eq 0 && ! -f "$CLIPS_DIR/IMG_7907.mov" ]]; then
    echo "no .mov/.MOV clips or parts in $STORE" >&2
    exit 1
  fi
fi

if [[ -z "$CLIPS_DIR" ]]; then
  CLIPS_DIR="$(iphone_samples_dir)"
fi

record "ffmpeg: $FFMPEG_BIN"
record "clips: $CLIPS_DIR"
if ! run_iphone_clip_checks "$CLIPS_DIR"; then
  usage >&2
  exit 1
fi
record "iphone checks passed"
log "report: $REPORT"
if [[ -n "$cleanup_clips" ]]; then
  rm -rf "$cleanup_clips"
fi
