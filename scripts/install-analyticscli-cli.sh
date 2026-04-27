#!/usr/bin/env bash
set -euo pipefail

package="${ANALYTICSCLI_CLI_PACKAGE:-@analyticscli/cli@preview}"
home_dir="${HOME:-$(pwd)}"
user_prefix="${ANALYTICSCLI_NPM_PREFIX:-${home_dir}/.local}"

print_path_hint() {
  local bin_dir="$1"
  cat <<EOF
analyticscli was installed into:
  ${bin_dir}

For future shells, make sure this directory is on PATH:
  export PATH="${bin_dir}:\$PATH"

For the current shell/session, run:
  export PATH="${bin_dir}:\$PATH"

Or reload your shell profile:
  source "${home_dir}/.bashrc" 2>/dev/null || source "${home_dir}/.profile"
EOF
}

ensure_profile_path() {
  local bin_dir="$1"
  local line="export PATH=\"${bin_dir}:\$PATH\""
  local wrote_any=false

  if [[ "${ANALYTICSCLI_SKIP_PROFILE_UPDATE:-}" == "true" ]]; then
    return 0
  fi

  for profile in "${home_dir}/.profile" "${home_dir}/.bashrc" "${home_dir}/.zshrc"; do
    if [[ ! -f "${profile}" ]]; then
      : >"${profile}"
    fi
    if ! grep -Fq "${line}" "${profile}"; then
      printf '\n# AnalyticsCLI CLI user-local npm bin\n%s\n' "${line}" >>"${profile}"
      wrote_any=true
    fi
  done

  if [[ "${wrote_any}" == "true" ]]; then
    echo "Added ${bin_dir} to shell profile files. Already-open terminals still need: export PATH=\"${bin_dir}:\$PATH\"" >&2
  fi
}

if ! command -v npm >/dev/null 2>&1; then
  if command -v analyticscli >/dev/null 2>&1; then
    echo "analyticscli already available: $(command -v analyticscli)"
    echo "npm is not available, so the package update check was skipped." >&2
    analyticscli --help >/dev/null
    exit 0
  fi
  echo "npm is required to install ${package}, but npm was not found." >&2
  exit 1
fi

echo "Ensuring AnalyticsCLI CLI from npm package ${package}"
set +e
global_output="$(npm install -g "${package}" 2>&1)"
global_exit=$?
set -e

if [[ ${global_exit} -ne 0 ]]; then
  if printf '%s' "${global_output}" | grep -Eiq 'EACCES|permission denied|access denied|operation not permitted'; then
    echo "Global npm install failed because of permissions. Falling back to user-local prefix: ${user_prefix}" >&2
    mkdir -p "${user_prefix}"
    npm install -g --prefix "${user_prefix}" "${package}"
    export PATH="${user_prefix}/bin:${PATH}"
    ensure_profile_path "${user_prefix}/bin"
  else
    printf '%s\n' "${global_output}" >&2
    exit "${global_exit}"
  fi
fi

if ! command -v analyticscli >/dev/null 2>&1; then
  echo "Installed ${package}, but analyticscli is still not on PATH." >&2
  if [[ -x "${user_prefix}/bin/analyticscli" ]]; then
    print_path_hint "${user_prefix}/bin" >&2
  else
    echo "Check your npm global bin directory with: npm prefix -g" >&2
  fi
  exit 1
fi

echo "analyticscli available: $(command -v analyticscli)"
analyticscli --help >/dev/null
case "$(command -v analyticscli)" in
  "${user_prefix}/bin/"*)
    ensure_profile_path "${user_prefix}/bin"
    print_path_hint "${user_prefix}/bin"
    ;;
esac
