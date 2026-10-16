#!/usr/bin/env bash
# Build a static LGPL ffmpeg + ffprobe for macOS arm64 with VideoToolbox and zscale.
# LGPL only: do not pass GPL, nonfree, or libx264 configure flags.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_macos_arm64
load_versions
load_configure_flags

PREFIX="$(vendor_prefix)"
CACHE="$(vendor_cache)"
DEPS="$CACHE/deps"
SRC="$CACHE/src"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET}"

mkdir -p "$PREFIX/bin" "$CACHE" "$DEPS" "$SRC"

if [[ -x "$PREFIX/bin/ffmpeg" && -x "$PREFIX/bin/ffprobe" && -f "$PREFIX/BUILD.json" ]]; then
  if python3 - "$PREFIX/BUILD.json" "$FFMPEG_VERSION" "$ZIMG_VERSION" <<'PY'; then
import json, sys
meta = json.load(open(sys.argv[1]))
sys.exit(0 if meta.get("ffmpegVersion") == sys.argv[2] and meta.get("zimgVersion") == sys.argv[3] else 1)
PY
    log "reusing $PREFIX (ffmpeg $FFMPEG_VERSION, zimg $ZIMG_VERSION)"
    exit 0
  fi
fi

if ! command -v pkg-config >/dev/null 2>&1 || ! command -v autoreconf >/dev/null 2>&1; then
  log "installing autoconf automake libtool pkg-config via Homebrew"
  brew install autoconf automake libtool pkg-config
fi

download_pinned "$FFMPEG_TARBALL_URL" "$CACHE/$FFMPEG_TARBALL_NAME" "$FFMPEG_TARBALL_SHA256"
download_pinned "$ZIMG_TARBALL_URL" "$CACHE/$ZIMG_TARBALL_NAME" "$ZIMG_TARBALL_SHA256"

rm -rf "$SRC/zimg" "$SRC/ffmpeg" "$DEPS"
mkdir -p "$SRC" "$DEPS"
tar -xzf "$CACHE/$ZIMG_TARBALL_NAME" -C "$SRC"
zimg_dir="$(find "$SRC" -maxdepth 1 -type d -name 'zimg*' | head -n 1)"
tar -xJf "$CACHE/$FFMPEG_TARBALL_NAME" -C "$SRC"
ffmpeg_dir="$(find "$SRC" -maxdepth 1 -type d -name 'ffmpeg-*' | head -n 1)"

log "building zimg $ZIMG_VERSION (static)"
(
  cd "$zimg_dir"
  ./autogen.sh
  ./configure --prefix="$DEPS" --disable-shared --enable-static
  make -j"$JOBS"
  make install
)

export PKG_CONFIG_PATH="$DEPS/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export PKG_CONFIG_LIBDIR="$DEPS/lib/pkgconfig"

log "building ffmpeg $FFMPEG_VERSION (LGPL, VideoToolbox, libzimg)"
(
  cd "$ffmpeg_dir"
  ./configure \
    --prefix="$PREFIX" \
    --extra-cflags="-I$DEPS/include" \
    --extra-ldflags="-L$DEPS/lib" \
    "${FFMPEG_LGPL_CONFIGURE_FLAGS[@]}"
  if grep -E 'ENABLE_GPL 1|CONFIG_GPL 1' ffbuild/config.h >/dev/null 2>&1; then
    echo "configure produced a GPL build; refusing to continue" >&2
    exit 1
  fi
  if grep -E 'CONFIG_NONFREE 1' ffbuild/config.h >/dev/null 2>&1; then
    echo "configure produced a nonfree build; refusing to continue" >&2
    exit 1
  fi
  make -j"$JOBS"
  make install
)

# Static prefix still copies headers/share; keep the artifact to bin + license + metadata.
rm -rf "$PREFIX/include" "$PREFIX/lib" "$PREFIX/share/ffmpeg" "$PREFIX/share/man" || true

cp "$ffmpeg_dir/COPYING.LGPLv2.1" "$PREFIX/COPYING.LGPLv2.1"
if [[ -f "$ffmpeg_dir/LICENSE.md" ]]; then
  cp "$ffmpeg_dir/LICENSE.md" "$PREFIX/LICENSE.md"
fi

export FFMPEG_VERSION ZIMG_VERSION FFMPEG_TRIPLE FFMPEG_LICENSE MACOSX_DEPLOYMENT_TARGET
export FFMPEG_TARBALL_URL FFMPEG_TARBALL_SHA256 ZIMG_TARBALL_URL ZIMG_TARBALL_SHA256
config_line="$("$PREFIX/bin/ffmpeg" -hide_banner -version | awk '/^configuration:/{print; exit}')"
export BUILD_PREFIX="$PREFIX"
export BUILD_CONFIG="${config_line#configuration: }"
python3 <<'PY'
import json, os, pathlib
path = pathlib.Path(os.environ["BUILD_PREFIX"]) / "BUILD.json"
path.write_text(
    json.dumps(
        {
            "ffmpegVersion": os.environ["FFMPEG_VERSION"],
            "zimgVersion": os.environ["ZIMG_VERSION"],
            "triple": os.environ["FFMPEG_TRIPLE"],
            "license": os.environ["FFMPEG_LICENSE"],
            "gpl": False,
            "nonfree": False,
            "macosxDeploymentTarget": os.environ["MACOSX_DEPLOYMENT_TARGET"],
            "configure": os.environ["BUILD_CONFIG"].split(),
            "source": {
                "ffmpeg": {
                    "url": os.environ["FFMPEG_TARBALL_URL"],
                    "sha256": os.environ["FFMPEG_TARBALL_SHA256"],
                },
                "zimg": {
                    "url": os.environ["ZIMG_TARBALL_URL"],
                    "sha256": os.environ["ZIMG_TARBALL_SHA256"],
                },
            },
        },
        indent=2,
    )
    + "\n"
)
PY

log "built $PREFIX/bin/ffmpeg and $PREFIX/bin/ffprobe"
"$PREFIX/bin/ffmpeg" -hide_banner -version | head -n 2
