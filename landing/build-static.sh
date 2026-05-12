#!/usr/bin/env bash
# Applies the static-export overlay onto landing/rocketteam (a git submodule
# tracking upstream hrdAI3/RocketTeam), removes server-only routes that can't
# be exported, generates demo data, runs `next build` in STATIC_EXPORT mode,
# and prints the artefact path. CI uploads landing/rocketteam/out as the
# Pages artifact; locally this script is what verifies the integration end
# to end.
#
# Idempotent: re-runs cleanly. Does NOT commit anything to the submodule —
# all changes stay in the submodule working tree.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LANDING_DIR="${REPO_ROOT}/landing"
ROCKET_DIR="${LANDING_DIR}/rocketteam"
OVERLAY_DIR="${LANDING_DIR}/overlay"
BASE_PATH="${STATIC_BASE_PATH:-}"

if [[ ! -d "${ROCKET_DIR}/src/app" ]]; then
  echo "[build-static] submodule landing/rocketteam not initialised — run 'git submodule update --init --recursive'" >&2
  exit 1
fi

echo "[build-static] applying overlay to ${ROCKET_DIR}"

# 1. Strip server-only routes that block `output: 'export'`.
rm -rf "${ROCKET_DIR}/src/app/api"
rm -rf "${ROCKET_DIR}/src/app/agents/[name]"
rm -rf "${ROCKET_DIR}/src/app/live"
rm -rf "${ROCKET_DIR}/src/app/sim"

# 2. Rsync overlay files in (mirror tree under landing/overlay/<path> →
# landing/rocketteam/<path>).
mkdir -p "${ROCKET_DIR}/src/app/agents/[name]"
cp "${OVERLAY_DIR}/next.config.js"                              "${ROCKET_DIR}/next.config.js"
cp "${OVERLAY_DIR}/tsconfig.json"                               "${ROCKET_DIR}/tsconfig.json"
cp "${OVERLAY_DIR}/src/app/page.tsx"                            "${ROCKET_DIR}/src/app/page.tsx"
cp "${OVERLAY_DIR}/src/app/layout.tsx"                          "${ROCKET_DIR}/src/app/layout.tsx"
cp "${OVERLAY_DIR}/src/app/org/page.tsx"                        "${ROCKET_DIR}/src/app/org/page.tsx"
cp "${OVERLAY_DIR}/src/components/StaticFetchShim.tsx"          "${ROCKET_DIR}/src/components/StaticFetchShim.tsx"
cp "${OVERLAY_DIR}/src/app/agents/[name]/page.tsx"              "${ROCKET_DIR}/src/app/agents/[name]/page.tsx"
cp "${OVERLAY_DIR}/src/app/agents/[name]/Client.tsx"            "${ROCKET_DIR}/src/app/agents/[name]/Client.tsx"

mkdir -p "${ROCKET_DIR}/tools"
cp "${OVERLAY_DIR}/tools/inline-static-data.ts"                 "${ROCKET_DIR}/tools/inline-static-data.ts"
cp "${OVERLAY_DIR}/tools/generate-demo-data.ts"                 "${ROCKET_DIR}/tools/generate-demo-data.ts"

# 3. Seed private/ if not already populated. Real deployments may mount their
# own private/ via a CI secret; demo seed is overridden iff DEMO_SEED=1.
if [[ ! -d "${ROCKET_DIR}/private/agents" ]] || [[ -z "$(ls -A "${ROCKET_DIR}/private/agents" 2>/dev/null | grep -v '^\.')" ]] || [[ "${DEMO_SEED:-0}" == "1" ]]; then
  echo "[build-static] generating demo data into ${ROCKET_DIR}/private/"
  mkdir -p "${ROCKET_DIR}/private/agents" "${ROCKET_DIR}/private/tasks" "${ROCKET_DIR}/private/resources"
  cp -R "${ROCKET_DIR}/private.example/." "${ROCKET_DIR}/private/"
  ( cd "${ROCKET_DIR}" && bun tools/generate-demo-data.ts )
fi

# 4. Install + dump JSON + build.
cd "${ROCKET_DIR}"
if [[ ! -d node_modules ]]; then
  echo "[build-static] installing rocketteam deps via bun"
  bun install
fi

echo "[build-static] dumping static data → public/data/"
bun tools/inline-static-data.ts

echo "[build-static] next build STATIC_EXPORT=1 STATIC_BASE_PATH='${BASE_PATH}'"
rm -rf .next out
STATIC_EXPORT=1 STATIC_BASE_PATH="${BASE_PATH}" ./node_modules/.bin/next build

echo "[build-static] DONE → ${ROCKET_DIR}/out"
echo "[build-static] artefact size: $(du -sh "${ROCKET_DIR}/out" | cut -f1)"
echo "[build-static] page count: $(find "${ROCKET_DIR}/out" -name 'index.html' | wc -l | tr -d ' ')"
