# ffmpeg artifacts

CI writes the macOS arm64 LGPL prefix to `darwin-arm64/` (gitignored binaries).
P1.7 video tools and P2-D packaging consume that layout:

```
vendor/ffmpeg/darwin-arm64/
  bin/ffmpeg
  bin/ffprobe
  BUILD.json
  COPYING.LGPLv2.1
  VERIFY.md          # written by scripts/ffmpeg/verify.sh
  SIGNING.md         # signed dummy app, or why signing was skipped
```

Do not commit Homebrew or evermeet.cx binaries here. Those are usually GPL.
