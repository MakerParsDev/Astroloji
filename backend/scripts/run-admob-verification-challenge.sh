#!/usr/bin/env bash
# Scoped SSV panel verification only. Use the existing Doppler service token.
# Never write test secrets to GITHUB_ENV, workflow dispatch inputs, or logs.
set -euo pipefail

operation="${1:-}"
case "$operation" in
  validate|create|inspect|delete) ;;
  *) echo 'Invalid SSV challenge operation.' >&2; exit 2 ;;
esac

for name in DOPPLER_PROJECT DOPPLER_CONFIG DOPPLER_TOKEN; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing challenge credential setting: %s\n' "$name" >&2
    exit 1
  fi
done

# The only GitHub Actions secret is DOPPLER_TOKEN. Do not echo the values.
custom_data="$(doppler secrets get ADMOB_SSV_TEST_CUSTOM_DATA --plain --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG")"
# Fail closed on malformed data BEFORE it reaches GitHub workflow commands.
# UUIDs cannot contain newline/command injection.
uuid='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
if [[ ! "$custom_data" =~ $uuid ]]; then
  echo 'Doppler custom data must be a UUID.' >&2
  exit 1
fi
user_id="$(doppler secrets get ADMOB_SSV_TEST_USER_ID --plain --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG")"
if [[ "$user_id" != admob-verify-* ]] || [[ ! "${user_id#admob-verify-}" =~ $uuid ]]; then
  echo 'Doppler user ID must use the admob-verify-UUID namespace.' >&2
  exit 1
fi
printf '::add-mask::%s\n' "$custom_data" >&2
printf '::add-mask::%s\n' "$user_id" >&2
export ADMOB_SSV_TEST_CUSTOM_DATA="$custom_data"
export ADMOB_SSV_TEST_USER_ID="$user_id"
unset custom_data user_id

if [[ "$operation" == 'validate' ]]; then
  printf '{"operation":"validate","secretsReady":true}\n'
  exit 0
fi

cloudflare_token="$(doppler secrets get CLOUDFLARE_API_TOKEN --plain --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG")"
if [[ -z "$cloudflare_token" ]]; then
  echo 'Doppler Cloudflare API token is missing.' >&2
  exit 1
fi
printf '::add-mask::%s\n' "$cloudflare_token" >&2
env -u DOPPLER_TOKEN CLOUDFLARE_API_TOKEN="$cloudflare_token" \
  npm run --silent "transition:challenge:$operation"
