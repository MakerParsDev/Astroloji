#!/usr/bin/env bash
set -euo pipefail

OPENCODE_VERSION="1.18.32"
OPENCODE_ASSET="opencode-linux-x64.tar.gz"
OPENCODE_SHA256="3046e0404fdc60fb80307e7a47824ba07477364178a4d09baa8548496dd6d43b"
OPENCODE_URL="https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/${OPENCODE_ASSET}"

temp_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
archive="${temp_root}/${OPENCODE_ASSET}"
install_dir="${temp_root}/opencode-${OPENCODE_VERSION}"

rm -rf "${install_dir}"
rm -f "${archive}"
mkdir -p "${install_dir}"

curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location   "${OPENCODE_URL}"   --output "${archive}"

printf '%s  %s\n' "${OPENCODE_SHA256}" "${archive}" | sha256sum --check --strict

tar -xzf "${archive}" -C "${install_dir}"
chmod +x "${install_dir}/opencode"
rm -f "${archive}"

"${install_dir}/opencode" --version

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "${install_dir}" >> "${GITHUB_PATH}"
else
  export PATH="${install_dir}:${PATH}"
  printf '%s\n' "${install_dir}"
fi
