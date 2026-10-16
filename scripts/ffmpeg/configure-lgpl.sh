# LGPL configure flags for the shipped macOS arm64 ffmpeg (sourced by the build).
# Keep GPL / nonfree / libx264 off. VideoToolbox is forced on so a missing SDK fails the build.

FFMPEG_LGPL_CONFIGURE_FLAGS=(
  --disable-gpl
  --disable-version3
  --disable-nonfree
  --enable-static
  --disable-shared
  --disable-debug
  --disable-doc
  --disable-ffplay
  --enable-ffmpeg
  --enable-ffprobe
  --enable-videotoolbox
  --enable-libzimg
  --enable-neon
  --pkg-config-flags=--static
)
