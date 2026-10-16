# Shared helpers for scripts/ffmpeg/*.sh
# shellcheck shell=bash

set -euo pipefail

scripts_ffmpeg_dir() {
  local src="${BASH_SOURCE[0]}"
  (cd "$(dirname "$src")" && pwd)
}

repo_root() {
  local dir
  dir="$(scripts_ffmpeg_dir)"
  while [[ "$dir" != / ]]; do
    if [[ -f "$dir/pnpm-workspace.yaml" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "cannot find repo root from $dir" >&2
  return 1
}

load_versions() {
  # shellcheck source=versions.env
  source "$(scripts_ffmpeg_dir)/versions.env"
}

load_configure_flags() {
  # shellcheck source=configure-lgpl.sh
  source "$(scripts_ffmpeg_dir)/configure-lgpl.sh"
}

vendor_prefix() {
  local root
  root="$(repo_root)"
  load_versions
  printf '%s\n' "$root/vendor/ffmpeg/${FFMPEG_TRIPLE}"
}

vendor_cache() {
  printf '%s\n' "$(repo_root)/vendor/ffmpeg/.cache"
}

samples_media_dir() {
  printf '%s\n' "$(repo_root)/datasets/ffmpeg-samples/media"
}

iphone_samples_dir() {
  printf '%s\n' "$(repo_root)/datasets/ffmpeg-samples/iphone"
}

sha256_of() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{ print $1 }'
  else
    shasum -a 256 "$file" | awk '{ print $1 }'
  fi
}

download_pinned() {
  local url="$1" dest="$2" expected="$3"
  if [[ -f "$dest" ]]; then
    local actual
    actual="$(sha256_of "$dest")"
    if [[ "$actual" == "$expected" ]]; then
      return 0
    fi
    echo "stale cache $dest (got $actual, want $expected); re-downloading" >&2
    rm -f "$dest"
  fi
  mkdir -p "$(dirname "$dest")"
  echo "downloading $url"
  curl -fL --retry 5 --retry-delay 2 -o "$dest.partial" "$url"
  local actual
  actual="$(sha256_of "$dest.partial")"
  if [[ "$actual" != "$expected" ]]; then
    echo "checksum mismatch for $url" >&2
    echo "  expected $expected" >&2
    echo "  actual   $actual" >&2
    rm -f "$dest.partial"
    return 1
  fi
  mv "$dest.partial" "$dest"
}

require_macos_arm64() {
  if [[ "$(uname -s)" != Darwin ]]; then
    echo "this script only builds the shipped ffmpeg on macOS" >&2
    return 1
  fi
  if [[ "$(uname -m)" != arm64 ]]; then
    echo "v1 ships darwin-arm64 only (got $(uname -m))" >&2
    return 1
  fi
}

log() {
  printf '%s\n' "$*"
}
