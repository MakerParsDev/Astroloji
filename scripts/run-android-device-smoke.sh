#!/bin/sh
set -eu

SERIAL="${1:?Usage: scripts/run-android-device-smoke.sh <adb-serial>}"
case "$SERIAL" in
  ''|'*'|all|current) echo 'An exact ADB serial is required.' >&2; exit 64 ;;
esac

OWNER_PACKAGE="com.parsfilo.astrology"
SMOKE_PACKAGE="com.parsfilo.astrology.devicesmoke"
SMOKE_TEST_PACKAGE="com.parsfilo.astrology.devicesmoke.test"
ADB_BIN="${ADB_BIN:-/home/msi/Android/Sdk/platform-tools/adb}"
AAPT2_BIN="${AAPT2_BIN:-/home/msi/Android/Sdk/build-tools/37.0.0/aapt2}"
TMP_DIR="$(mktemp -d /tmp/astrology-device-smoke.XXXXXX)"
chmod 700 "$TMP_DIR"

adb() {
  "$ADB_BIN" "$@"
}

aapt2() {
  "$AAPT2_BIN" "$@"
}

cleanup() {
  adb -s "$SERIAL" shell pm uninstall "$SMOKE_TEST_PACKAGE" >/dev/null 2>&1 || true
  adb -s "$SERIAL" shell pm uninstall "$SMOKE_PACKAGE" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

device_state="$(adb -s "$SERIAL" get-state 2>/dev/null || true)"
[ "$device_state" = 'device' ] || { echo 'Target ADB serial is not ready.' >&2; exit 65; }

adb -s "$SERIAL" shell pm path "$OWNER_PACKAGE" | grep -q '^package:' || {
  echo 'Owner package is not installed on the target serial.' >&2
  exit 66
}

owner_version_before="$(adb -s "$SERIAL" shell dumpsys package "$OWNER_PACKAGE" | sed -n 's/.*versionName=//p' | head -1 | tr -d '\r')"
owner_apk="$(adb -s "$SERIAL" shell pm path "$OWNER_PACKAGE" | head -1 | sed 's/^package://' | tr -d '\r')"
adb -s "$SERIAL" pull "$owner_apk" "$TMP_DIR/owner.apk" >/dev/null
resource_table="$TMP_DIR/resources.txt"
aapt2 dump resources "$TMP_DIR/owner.apk" > "$resource_table"

firebaseApiKey=''
owner_version_after="$(adb -s "$SERIAL" shell dumpsys package "$OWNER_PACKAGE" | sed -n 's/.*versionName=//p' | head -1 | tr -d '\r')"
[ "$owner_version_before" = "$owner_version_after" ] || {
  echo 'Owner package version changed unexpectedly.' >&2
  exit 67
}

echo 'Device smoke runner skeleton is configured; live lifecycle implementation is pending.' >&2
exit 68
