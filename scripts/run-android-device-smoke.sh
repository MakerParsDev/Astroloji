#!/bin/sh
set -eu

SERIAL="${1:?Usage: scripts/run-android-device-smoke.sh <adb-serial>}"
case "$SERIAL" in
  ''|all|current|*'*'*|*'?'*|*'['*)
    echo 'An exact ADB serial is required.' >&2
    exit 64
    ;;
esac

OWNER_PACKAGE="com.parsfilo.astrology"
SMOKE_PACKAGE="com.parsfilo.astrology.devicesmoke"
SMOKE_TEST_PACKAGE="com.parsfilo.astrology.devicesmoke.test"
SMOKE_TEST_CLASS="com.parsfilo.astrology.devicesmoke.LiveIdentityLifecycleSmokeTest"
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ANDROID_PROJECT="$REPO_ROOT/Astroloji"
ANDROID_HOME="${ANDROID_HOME:-/home/msi/Android/Sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-/tmp/astro-gradle}"
ADB_BIN="${ADB_BIN:-$ANDROID_HOME/platform-tools/adb}"
AAPT2_BIN="${AAPT2_BIN:-$ANDROID_HOME/build-tools/37.0.0/aapt2}"
APKSIGNER_BIN="${APKSIGNER_BIN:-$ANDROID_HOME/build-tools/37.0.0/apksigner}"
TMP_DIR="$(mktemp -d /tmp/astrology-device-smoke.XXXXXX)"
chmod 700 "$TMP_DIR"
instrumentation_log="$TMP_DIR/instrumentation.log"
: > "$instrumentation_log"
chmod 600 "$instrumentation_log"

adb() {
  "$ADB_BIN" "$@"
}

aapt2() {
  "$AAPT2_BIN" "$@"
}

cleanup_smoke_packages() {
  adb -s "$SERIAL" uninstall "$SMOKE_TEST_PACKAGE" >/dev/null 2>&1 || true
  adb -s "$SERIAL" uninstall "$SMOKE_PACKAGE" >/dev/null 2>&1 || true
}

cleanup() {
  cleanup_smoke_packages
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

package_version() {
  adb -s "$SERIAL" shell dumpsys package "$OWNER_PACKAGE" |
    sed -n 's/^[[:space:]]*versionName=//p' |
    head -1 |
    tr -d '\r'
}

certificate_digest() {
  "$APKSIGNER_BIN" verify --print-certs "$1" |
    awk -F'digest: ' '/certificate SHA-256 digest:/ { print $2; exit }'
}

extract_resource() {
  resource_name="$1"
  awk -v resource_name="$resource_name" '
    $0 ~ ("string/" resource_name "$") { found = 1; next }
    found && /^[[:space:]]*\(\) "/ {
      value = $0
      sub(/^[^"]*"/, "", value)
      sub(/"[[:space:]]*$/, "", value)
      print value
      exit
    }
    found && /^[[:space:]]*resource / { exit 2 }
  ' "$resource_table"
}

require_private_value() {
  name="$1"
  value="$2"
  maximum_length="$3"
  [ -n "$value" ] || { echo "Missing installed public resource: $name" >&2; exit 67; }
  [ "${#value}" -le "$maximum_length" ] || { echo "Installed public resource is oversized: $name" >&2; exit 67; }
  compact="$(printf '%s' "$value" | tr -d '\r\n')"
  [ "$compact" = "$value" ] || { echo "Installed public resource is malformed: $name" >&2; exit 67; }
}

device_state="$(adb -s "$SERIAL" get-state 2>/dev/null || true)"
[ "$device_state" = 'device' ] || { echo 'Target ADB serial is not ready.' >&2; exit 65; }

adb -s "$SERIAL" shell pm path "$OWNER_PACKAGE" | grep -q '^package:' || {
  echo 'Owner package is not installed on the target serial.' >&2
  exit 66
}

owner_version_before="$(package_version)"
owner_apk_path="$(adb -s "$SERIAL" shell pm path "$OWNER_PACKAGE" | head -1 | sed 's/^package://' | tr -d '\r')"
adb -s "$SERIAL" pull "$owner_apk_path" "$TMP_DIR/owner-before.apk" >/dev/null
owner_cert_before="$(certificate_digest "$TMP_DIR/owner-before.apk")"
if [ -z "$owner_version_before" ] || [ -z "$owner_cert_before" ]; then
  echo 'Unable to snapshot owner package identity.' >&2
  exit 66
fi

resource_table="$TMP_DIR/resources.txt"
aapt2 dump resources "$TMP_DIR/owner-before.apk" > "$resource_table"
firebase_api_key="$(extract_resource "google_api_key")"
firebase_app_id="$(extract_resource "google_app_id")"
firebase_project_id="$(extract_resource "project_id")"
firebase_sender_id="$(extract_resource "gcm_defaultSenderId")"
require_private_value firebaseApiKey "$firebase_api_key" 128
require_private_value firebaseAppId "$firebase_app_id" 128
require_private_value firebaseProjectId "$firebase_project_id" 128
require_private_value firebaseSenderId "$firebase_sender_id" 32

(
  cd "$ANDROID_PROJECT"
  ANDROID_HOME="$ANDROID_HOME" \
  ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT" \
  GRADLE_USER_HOME="$GRADLE_USER_HOME" \
    sh ./gradlew --no-daemon \
      -Dorg.gradle.jvmargs='-Xmx2048m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8' \
      :device-smoke:detekt \
      :device-smoke:ktlintCheck \
      :device-smoke:testDebugUnitTest \
      :device-smoke:assembleDebug \
      :device-smoke:assembleDebugAndroidTest \
      >/dev/null
)

smoke_apk="$ANDROID_PROJECT/device-smoke/build/outputs/apk/debug/device-smoke-debug.apk"
smoke_test_apk="$ANDROID_PROJECT/device-smoke/build/outputs/apk/androidTest/debug/device-smoke-debug-androidTest.apk"
if [ ! -f "$smoke_apk" ] || [ ! -f "$smoke_test_apk" ]; then
  echo 'Smoke APK outputs are missing.' >&2
  exit 68
fi

cleanup_smoke_packages
adb -s "$SERIAL" install -r "$smoke_apk" >/dev/null
adb -s "$SERIAL" install -r "$smoke_test_apk" >/dev/null

set +e
adb -s "$SERIAL" shell am instrument -w -r \
  -e class "$SMOKE_TEST_CLASS" \
  -e firebaseApiKey "$firebase_api_key" \
  -e firebaseAppId "$firebase_app_id" \
  -e firebaseProjectId "$firebase_project_id" \
  -e firebaseSenderId "$firebase_sender_id" \
  -e backendBaseUrl "https://astrology.parsfilo.com" \
  "$SMOKE_TEST_PACKAGE/androidx.test.runner.AndroidJUnitRunner" \
  > "$instrumentation_log" 2>&1
instrumentation_status=$?
set -e

if [ "$instrumentation_status" -ne 0 ] ||
  ! grep -Fq 'INSTRUMENTATION_STATUS: device_smoke_result=pass' "$instrumentation_log" ||
  ! grep -Fq 'INSTRUMENTATION_CODE: -1' "$instrumentation_log"; then
  failed_stage="$(sed -n 's/.*device_smoke_stage=\([a-z_]*\).*/\1/p' "$instrumentation_log" | tail -1)"
  failed_status="$(sed -n 's/.*status=\([0-9][0-9]*\).*/\1/p' "$instrumentation_log" | tail -1)"
  echo "DEVICE_SMOKE_FAIL stage=${failed_stage:-unknown} status=${failed_status:-unknown}" >&2
  exit 69
fi

cleanup_smoke_packages
if adb -s "$SERIAL" shell pm list packages | grep -Eq "^package:($SMOKE_PACKAGE|$SMOKE_TEST_PACKAGE)$"; then
  echo 'Smoke packages remain installed after cleanup.' >&2
  exit 70
fi

owner_version_after="$(package_version)"
owner_apk_after_path="$(adb -s "$SERIAL" shell pm path "$OWNER_PACKAGE" | head -1 | sed 's/^package://' | tr -d '\r')"
adb -s "$SERIAL" pull "$owner_apk_after_path" "$TMP_DIR/owner-after.apk" >/dev/null
owner_cert_after="$(certificate_digest "$TMP_DIR/owner-after.apk")"

[ "$owner_version_before" = "$owner_version_after" ] || {
  echo 'Owner package version changed unexpectedly.' >&2
  exit 71
}
[ "$owner_cert_before" = "$owner_cert_after" ] || {
  echo 'Owner package certificate changed unexpectedly.' >&2
  exit 71
}

echo 'DEVICE_SMOKE_PASS stages=anonymous_auth,fid,register,profile,refresh,delete,post_delete,post_delete_write owner_preserved=true cleanup=true'
