#!/usr/bin/env bash
# Fetch pinned public decode samples. iPhone clips are optional (see iphone/README.md).
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

MEDIA="$(samples_media_dir)"
mkdir -p "$MEDIA"

# name|url|sha256
SAMPLES=(
  "h264-bbb.mp4|https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4|77145c94c11f3754207499158df22406e1fe7635553c1c86dc5e881dfeb32016"
  "hevc-bbb.mp4|https://test-videos.co.uk/vids/bigbuckbunny/mp4/h265/360/Big_Buck_Bunny_360_10s_1MB.mp4|1002dc56cbc487595252b86a088cbf6ba03eb434c33c27a31ca46254310fb05b"
  "dovi-p5.mp4|https://fate-suite.ffmpeg.org/mov/dovi-p5.mp4|11fe599fd77e31e26fbf855bae1cd9931df9f261a0a7b1dce9fad9b236677c4b"
  "dovi-p81.mp4|https://fate-suite.ffmpeg.org/mov/dovi-p81.mp4|3313278f3dc49b0b3680ec7c3d72622ec0a770faff9721c5842aaf899d5471c5"
)

for row in "${SAMPLES[@]}"; do
  IFS='|' read -r name url sha <<<"$row"
  download_pinned "$url" "$MEDIA/$name" "$sha"
done

log "samples ready in $MEDIA"
ls -lh "$MEDIA"
