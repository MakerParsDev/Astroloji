#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${MODEL:?MODEL is required}"
: "${OPENCODE_DEFAULT_AGENT:?OPENCODE_DEFAULT_AGENT is required}"

if [[ ! "${OPENCODE_DEFAULT_AGENT}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Invalid OPENCODE_DEFAULT_AGENT." >&2
  exit 64
fi

case "${OPENCODE_GIT_WRITE:-false}" in
  true|false) ;;
  *)
    echo "OPENCODE_GIT_WRITE must be true or false." >&2
    exit 64
    ;;
esac

export MODEL PROMPT
export SHARE="false"
export USE_GITHUB_TOKEN="true"
export OPENCODE_EXPERIMENTAL_LSP_TOOL="true"
export OPENCODE_CONFIG_CONTENT="{\"default_agent\":\"${OPENCODE_DEFAULT_AGENT}\"}"

if [[ "${OPENCODE_GIT_WRITE:-false}" == "true" ]]; then
  auth_header="$(
    printf 'x-access-token:%s' "${GITHUB_TOKEN}"       | base64       | tr -d '\r\n'
  )"

  export GIT_CONFIG_COUNT="3"
  export GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
  export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic ${auth_header}"
  export GIT_CONFIG_KEY_1="user.name"
  export GIT_CONFIG_VALUE_1="opencode-agent[bot]"
  export GIT_CONFIG_KEY_2="user.email"
  export GIT_CONFIG_VALUE_2="opencode-agent[bot]@users.noreply.github.com"

  unset auth_header
fi

exec opencode github run
