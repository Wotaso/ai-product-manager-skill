#!/usr/bin/env bash
# Copy growth-engineer runtime from an installed skill into the active workspace root
# so `node scripts/openclaw-growth-start.mjs` works (paths match docs + agent runs).
#
# Typical layout after installing a bundled growth runtime skill:
#   <workspace>/skills/<skill-slug>/scripts/*.mjs
# Hermes normally installs into ~/.hermes/skills/<skill-slug>/, so the target
# workspace is the current working directory unless OPENCLAW_GROWTH_WORKSPACE is set.
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

if [[ -n "${OPENCLAW_GROWTH_WORKSPACE:-}" ]]; then
  WORKSPACE="$(cd "${OPENCLAW_GROWTH_WORKSPACE}" && pwd)"
elif [[ -n "${HOME:-}" && "${SKILL_ROOT}" == "${HOME}/.hermes/skills/"* ]]; then
  WORKSPACE="$(pwd)"
else
  WORKSPACE="$(cd "${SKILL_ROOT}/../.." && pwd)"
fi

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

heartbeat_path="${WORKSPACE}/HEARTBEAT.md"
heartbeat_block="$(cat <<'EOF'
<!-- openclaw-growth-engineer:start -->
tasks:

- name: openclaw-growth-engineer-run
  interval: 12h
  prompt: "Run `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json` from the workspace if the config and runtime files exist. The runner owns schedule.cadences, connectorHealthCheckIntervalMinutes, skipIfNoDataChange, and skipIfIssueSetUnchanged. If it reports connector-health alerts, production crashes, generated issues, or actionable growth findings, summarize only the action and evidence. If setup files are missing, tell the user to run `node scripts/openclaw-growth-wizard.mjs --connectors`. If there is no actionable output, reply HEARTBEAT_OK."

# Keep this section small. Do not put secrets in HEARTBEAT.md.
<!-- openclaw-growth-engineer:end -->
EOF
)"

HEARTBEAT_PATH="${heartbeat_path}" HEARTBEAT_BLOCK="${heartbeat_block}" node <<'NODE'
const fs = require('node:fs');

const path = process.env.HEARTBEAT_PATH;
const block = process.env.HEARTBEAT_BLOCK;
const markerPattern = /<!-- openclaw-growth-engineer:start -->[\s\S]*?<!-- openclaw-growth-engineer:end -->/;

let existing = '';
try {
  existing = fs.readFileSync(path, 'utf8');
} catch {
  existing = '';
}

const hasWork = existing
  .split(/\r?\n/)
  .map((line) => line.trim())
  .some((line) => line && !line.startsWith('#') && !line.startsWith('<!--') && !line.startsWith('-->'));

const next = markerPattern.test(existing)
  ? existing.replace(markerPattern, block)
  : hasWork
    ? `${existing.trimEnd()}\n\n${block}\n`
    : `# OpenClaw heartbeat checklist\n\n${block}\n`;

if (next !== existing) {
  fs.writeFileSync(path, next, 'utf8');
}
NODE

echo "Copied ${skill_slug} runtime into workspace:"
echo "  ${WORKSPACE}/scripts"
echo "  ${WORKSPACE}/data/openclaw-growth-engineer"
echo "  ${WORKSPACE}/HEARTBEAT.md"
echo "Next:"
echo "  cd ${WORKSPACE} && node scripts/openclaw-growth-wizard.mjs --connectors"
echo "Then:"
echo "  cd ${WORKSPACE} && node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json"
