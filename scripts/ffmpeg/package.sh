#!/usr/bin/env bash
# Pack the darwin-arm64 prefix for later P1.7 / P2-D download.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_versions
PREFIX="$(vendor_prefix)"
if [[ ! -x "$PREFIX/bin/ffmpeg" ]]; then
  echo "nothing to package; run scripts/ffmpeg/build-macos-arm64.sh first" >&2
  exit 1
fi

out="${1:-$(repo_root)/vendor/ffmpeg/ffmpeg-${FFMPEG_TRIPLE}-${FFMPEG_VERSION}.tar.xz}"
mkdir -p "$(dirname "$out")"
tar -C "$(dirname "$PREFIX")" -cJf "$out" "$(basename "$PREFIX")"
log "wrote $out ($(ls -lh "$out" | awk '{print $5}'))"
