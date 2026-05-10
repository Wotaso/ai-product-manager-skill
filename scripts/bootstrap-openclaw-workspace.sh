#!/usr/bin/env bash
# Copy growth-engineer runtime from a ClawHub skill install into the OpenClaw workspace root
# so `node scripts/openclaw-growth-start.mjs` works (paths match docs + OpenClaw run).
#
# Typical layout after installing a bundled growth runtime skill:
#   <workspace>/skills/<skill-slug>/scripts/*.mjs
# This script creates:
#   <workspace>/scripts/*.mjs
#   <workspace>/data/openclaw-growth-engineer/*.json
#
# Idempotent. Safe to re-run after skill updates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

skill_slug="$(basename "${SKILL_ROOT}")"
if [[ "${skill_slug}" != "product-manager-skill" && "${skill_slug}" != "ai-product-manager" && "${skill_slug}" != "openclaw-growth-engineer" ]]; then
  echo "bootstrap-openclaw-workspace.sh: expected to live under skills/openclaw-growth-engineer/scripts/ or a legacy ai-product-manager/product-manager-skill alias (ClawHub install)." >&2
  echo "In the Agentic Analytics monorepo, scripts already live at repo root; nothing to copy." >&2
  exit 0
fi

WORKSPACE="$(cd "${SKILL_ROOT}/../.." && pwd)"

if [[ "${skill_slug}" == "openclaw-growth-engineer" && -f "${SKILL_ROOT}/.clawhub/origin.json" && "${OPENCLAW_GROWTH_DISABLE_SELF_UPDATE:-}" != "1" && "${OPENCLAW_GROWTH_BOOTSTRAP_SKIP_UPDATE:-}" != "1" ]]; then
  if command -v clawhub >/dev/null 2>&1; then
    (cd "${WORKSPACE}" && clawhub --no-input --dir skills update openclaw-growth-engineer --force) || true
  elif command -v npx >/dev/null 2>&1; then
    (cd "${WORKSPACE}" && npx -y clawhub --no-input --dir skills update openclaw-growth-engineer --force) || true
  fi
fi

mkdir -p "${WORKSPACE}/scripts" "${WORKSPACE}/data/openclaw-growth-engineer"

shopt -s nullglob
for f in "${SCRIPT_DIR}/"*.mjs "${SCRIPT_DIR}/"*.py; do
  base="$(basename "$f")"
  if [[ "${base}" == "bootstrap-openclaw-workspace.sh" ]]; then
    continue
  fi
  cp "${f}" "${WORKSPACE}/scripts/${base}"
done

for f in "${SKILL_ROOT}/data/openclaw-growth-engineer/"*.json; do
  cp "${f}" "${WORKSPACE}/data/openclaw-growth-engineer/$(basename "${f}")"
done

echo "Copied ${skill_slug} runtime into workspace:"
echo "  ${WORKSPACE}/scripts"
echo "  ${WORKSPACE}/data/openclaw-growth-engineer"
echo "Next:"
echo "  cd ${WORKSPACE} && node scripts/openclaw-growth-wizard.mjs --connectors"
echo "Then:"
echo "  cd ${WORKSPACE} && node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json"
