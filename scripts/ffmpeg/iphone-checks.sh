# iPhone clip checks shared by verify.sh (CI hook) and verify-iphone.sh (local).
# shellcheck shell=bash

list_iphone_clips() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    return 0
  fi
  find "$dir" -maxdepth 1 -type f \( -iname '*.mov' -o -iname '*.mp4' -o -iname '*.m4v' \) | LC_ALL=C sort
}

probe_v() {
  local file="$1" field="$2"
  "$FFPROBE_BIN" -hide_banner -v error -select_streams v:0 \
    -show_entries "stream=$field" -of default=nw=1:nk=1 "$file" 2>/dev/null | head -n 1
}

probe_rotation() {
  local file="$1"
  local rot
  rot="$("$FFPROBE_BIN" -hide_banner -v error -select_streams v:0 \
    -show_entries stream_side_data=rotation -of default=nw=1:nk=1 "$file" 2>/dev/null | head -n 1 || true)"
  if [[ -n "$rot" ]]; then
    printf '%s\n' "$rot"
    return 0
  fi
  "$FFPROBE_BIN" -hide_banner -v error -select_streams v:0 \
    -show_entries stream_tags=rotate -of default=nw=1:nk=1 "$file" 2>/dev/null | head -n 1 || true
}

hdr_zscale_tin() {
  local transfer="${1:-}"
  transfer="$(printf '%s' "$transfer" | tr '[:upper:]' '[:lower:]')"
  case "$transfer" in
    smpte2084 | pq) printf '%s\n' smpte2084 ;;
    arib-std-b67 | hlg | bt2020-10) printf '%s\n' arib-std-b67 ;;
    *) printf '\n' ;;
  esac
}

tonemap_vf() {
  local tin="$1"
  printf 'zscale=tin=%s:min=bt2020nc:pin=bt2020:t=linear:npl=100,tonemap=tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709,format=yuv420p,scale=160:-2' "$tin"
}

# Video only. Never `-map 0` / `-map 0:a` — iPhone `apac` is not decodable.
ffmpeg_video_only() {
  "$FFMPEG_BIN" -hide_banner -nostdin -y -i "$1" -map 0:v:0 -an -fps_mode vfr "${@:2}"
}

decode_mapped_video() {
  local label="$1" input="$2"
  local out="$WORKDIR/${label}.framemd5"
  ffmpeg_video_only "$input" -frames:v 8 -f framemd5 "$out"
  [[ -s "$out" ]]
  record "decode $label (−map 0:v:0, fps_mode=vfr) → framemd5 ($(wc -l <"$out") lines)"
}

tonemap_mapped_video() {
  local label="$1" input="$2" tin="$3"
  local png="$WORKDIR/${label}-tonemap.png"
  ffmpeg_video_only "$input" -frames:v 1 -update 1 -vf "$(tonemap_vf "$tin")" "$png"
  [[ -s "$png" ]]
  local width height
  width="$(probe_v "$png" width)"
  height="$(probe_v "$png" height)"
  printf '%s' "${width}x${height}" >"$WORKDIR/${label}-tonemap.size"
  record "tonemap $label tin=$tin autorotate-on → ${width}x${height} bt709 png"
}

check_iphone_clip() {
  local clip="$1"
  local base
  base="$(basename "$clip")"
  local label="iphone-${base}"
  local transfer primaries matrix width height r_fps avg_fps rotation tin dv

  transfer="$(probe_v "$clip" color_transfer || true)"
  primaries="$(probe_v "$clip" color_primaries || true)"
  matrix="$(probe_v "$clip" color_space || true)"
  width="$(probe_v "$clip" width || true)"
  height="$(probe_v "$clip" height || true)"
  r_fps="$(probe_v "$clip" r_frame_rate || true)"
  avg_fps="$(probe_v "$clip" avg_frame_rate || true)"
  rotation="$(probe_rotation "$clip" || true)"
  dv="$(probe_v "$clip" dv_profile || true)"
  tin="$(hdr_zscale_tin "$transfer")"

  record "iphone $base: ${width}x${height} transfer=${transfer:-unset} primaries=${primaries:-unset} matrix=${matrix:-unset} rotate=${rotation:-0} r_fps=$r_fps avg_fps=$avg_fps dv=${dv:-none}"

  decode_mapped_video "$label" "$clip"

  if [[ "$r_fps" != "$avg_fps" && -n "$avg_fps" ]]; then
    record "VFR $base: r_frame_rate=$r_fps avg_frame_rate=$avg_fps (decoded with -fps_mode vfr)"
  else
    record "timestamps $base look CFR (r_frame_rate=$r_fps)"
  fi

  if [[ -z "$tin" ]]; then
    record "no HDR transfer on $base (SDR or untagged); tonemap skipped"
    return 0
  fi

  tonemap_mapped_video "$label" "$clip" "$tin"
  local size out_w out_h
  size="$(cat "$WORKDIR/${label}-tonemap.size")"
  out_w="${size%x*}"
  out_h="${size#*x}"
  if [[ "$rotation" == *90* || "$rotation" == *-90* ]]; then
    if [[ -n "$out_h" && -n "$out_w" && "$out_h" -gt "$out_w" ]]; then
      record "autorotate $base: portrait output ${out_w}x${out_h} after ${rotation}° display matrix"
    else
      echo "expected portrait output after ${rotation}° rotate, got ${out_w}x${out_h}" >&2
      exit 1
    fi
  fi
}

run_iphone_clip_checks() {
  local dir="$1"
  local found=0
  local clip
  while IFS= read -r clip; do
    [[ -n "$clip" && -f "$clip" ]] || continue
    found=1
    check_iphone_clip "$clip"
  done < <(list_iphone_clips "$dir")
  if [[ "$found" -eq 0 ]]; then
    record "DEFERRED: no iPhone clips in $dir (case-insensitive *.mov / *.mp4 / *.m4v). See datasets/ffmpeg-samples/iphone/README.md"
    return 1
  fi
  return 0
}
