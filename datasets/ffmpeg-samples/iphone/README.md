# User iPhone clips (optional P0.8 hook)

`scripts/ffmpeg/verify.sh` decodes every `.mov`, `.mp4`, and `.m4v` in this
folder after the public samples. Nothing here is committed.

Useful files:

- iPhone HEVC SDR (Settings → Camera → Formats → High Efficiency)
- the same climb with HDR on
- Dolby Vision if the phone recorded it

Keep clips short (a few seconds). They stay on the machine / CI cache; do not
add them to git.
