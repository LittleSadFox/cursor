#!/usr/bin/env bash
# Sign the CI ffmpeg/ffprobe with the hardened runtime and run them from a dummy .app.
# Notarize when App Store Connect API secrets are present. Skip (exit 0) when they are not.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_versions
PREFIX="$(vendor_prefix)"
APP_ROOT="${DUMMY_APP_ROOT:-$PREFIX/ClimbingCoachFfmpegProbe.app}"
SKIP_LOG="${SIGN_SKIP_LOG:-$PREFIX/SIGNING.md}"

missing=()
[[ -n "${APPLE_DEVELOPER_ID_P12:-}" ]] || missing+=(APPLE_DEVELOPER_ID_P12)
[[ -n "${APPLE_DEVELOPER_ID_P12_PASSWORD:-}" ]] || missing+=(APPLE_DEVELOPER_ID_P12_PASSWORD)
[[ -n "${APPLE_TEAM_ID:-}" ]] || missing+=(APPLE_TEAM_ID)

if [[ ${#missing[@]} -gt 0 ]]; then
  mkdir -p "$(dirname "$SKIP_LOG")"
  cat >"$SKIP_LOG" <<EOF
# ffmpeg dummy-app signing — skipped

Apple Developer ID secrets are not configured in this environment.

Missing: ${missing[*]}

Required to sign with the hardened runtime:

- \`APPLE_DEVELOPER_ID_P12\` — base64-encoded Developer ID Application .p12
- \`APPLE_DEVELOPER_ID_P12_PASSWORD\` — password for that .p12
- \`APPLE_TEAM_ID\` — 10-character team id

Optional, to notarize the dummy app:

- \`APPLE_API_KEY_P8\` — App Store Connect API key (.p8 contents)
- \`APPLE_API_KEY_ID\`
- \`APPLE_API_ISSUER_ID\`

P0.8 continues without signing. Re-run \`scripts/ffmpeg/sign-dummy-app.sh\` on
macos-14 once the secrets exist. ADR-002 stays Proposed until that check runs.
EOF
  log "SKIP signing/notarization: missing ${missing[*]} (wrote $SKIP_LOG)"
  exit 0
fi

require_macos_arm64
if [[ ! -x "$PREFIX/bin/ffmpeg" || ! -x "$PREFIX/bin/ffprobe" ]]; then
  echo "build ffmpeg before signing" >&2
  exit 1
fi

SCRIPT_DIR="$(scripts_ffmpeg_dir)"
CONTENTS="$APP_ROOT/Contents"
MACOS="$CONTENTS/MacOS"
rm -rf "$APP_ROOT"
mkdir -p "$MACOS" "$CONTENTS/Resources"
cp "$SCRIPT_DIR/dummy-app/Info.plist" "$CONTENTS/Info.plist"
cp "$PREFIX/bin/ffmpeg" "$MACOS/ffmpeg"
cp "$PREFIX/bin/ffprobe" "$MACOS/ffprobe"
clang -mmacosx-version-min="$MACOSX_DEPLOYMENT_TARGET" -arch arm64 \
  -o "$MACOS/ffmpeg-probe" "$SCRIPT_DIR/dummy-app/ffmpeg-probe.c"

KEYCHAIN="$PREFIX/signing.keychain-db"
P12="$PREFIX/developer-id.p12"
rm -f "$P12" "$KEYCHAIN"
ORIG_KEYCHAINS="$(security list-keychains -d user | tr -d '"')"
cleanup() {
  # bash 3.2 on macOS runners: unquoted split of the saved keychain list.
  # shellcheck disable=SC2086
  security list-keychains -d user -s $ORIG_KEYCHAINS >/dev/null 2>&1 || true
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -f "$P12"
  rm -f "$PREFIX"/AuthKey_*.p8
}
trap cleanup EXIT

P12_OUT="$P12" python3 -c 'import base64,os,pathlib; pathlib.Path(os.environ["P12_OUT"]).write_bytes(base64.b64decode(os.environ["APPLE_DEVELOPER_ID_P12"]))'

password="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
security create-keychain -p "$password" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$password" "$KEYCHAIN"
security import "$P12" -k "$KEYCHAIN" -P "$APPLE_DEVELOPER_ID_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$KEYCHAIN" >/dev/null
# shellcheck disable=SC2086
security list-keychains -d user -s "$KEYCHAIN" $ORIG_KEYCHAINS

identity="$(security find-identity -v -p codesigning "$KEYCHAIN" | awk -F'\"' '/Developer ID Application/{print $2; exit}')"
if [[ -z "$identity" ]]; then
  echo "no Developer ID Application identity in the imported keychain" >&2
  exit 1
fi

sign() {
  codesign --force --options runtime --timestamp --entitlements "$SCRIPT_DIR/dummy-app/entitlements.plist" --sign "$identity" "$1"
}
sign "$MACOS/ffmpeg"
sign "$MACOS/ffprobe"
sign "$MACOS/ffmpeg-probe"
sign "$APP_ROOT"

codesign --verify --deep --strict --verbose=2 "$APP_ROOT"
"$MACOS/ffmpeg-probe" >/dev/null
"$MACOS/ffmpeg" -hide_banner -version | head -n 2

notarize_note="notarization skipped (APPLE_API_KEY_P8 / APPLE_API_KEY_ID / APPLE_API_ISSUER_ID not all set)"
if [[ -n "${APPLE_API_KEY_P8:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER_ID:-}" ]]; then
  key="$PREFIX/AuthKey_${APPLE_API_KEY_ID}.p8"
  printf '%s\n' "$APPLE_API_KEY_P8" >"$key"
  zip_path="$PREFIX/ClimbingCoachFfmpegProbe.zip"
  ditto -c -k --keepParent "$APP_ROOT" "$zip_path"
  xcrun notarytool submit "$zip_path" \
    --key "$key" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER_ID" \
    --wait
  xcrun stapler staple "$APP_ROOT"
  rm -f "$key"
  notarize_note="notarized and stapled"
fi

cat >"$SKIP_LOG" <<EOF
# ffmpeg dummy-app signing

- App: \`$APP_ROOT\`
- Identity: Developer ID Application (team \`$APPLE_TEAM_ID\`)
- Hardened runtime: yes
- $notarize_note
- Ran \`ffmpeg-probe\` and \`ffmpeg -version\` inside the signed bundle
EOF
log "signed dummy app ($notarize_note)"
