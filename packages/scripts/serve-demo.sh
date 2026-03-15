#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIST="${ROOT_DIR}/frontend/dist"
DOCS_DIST="${ROOT_DIR}/docs-site/dist"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"
DOCS_PORT="${DOCS_PORT:-4174}"

if [[ ! -d "${FRONTEND_DIST}" ]]; then
  echo "Missing frontend dist: ${FRONTEND_DIST}"
  echo "Build it with: (cd frontend && npm run build)"
  exit 1
fi

if [[ ! -d "${DOCS_DIST}" ]]; then
  echo "Missing docs-site dist: ${DOCS_DIST}"
  echo "Build it with: (cd docs-site && npm run build)"
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "python or python3 is required to run the demo server."
  exit 1
fi

echo "Serving frontend on http://localhost:${FRONTEND_PORT}"
echo "Serving docs site on http://localhost:${DOCS_PORT}"
echo "Press Ctrl+C to stop both servers."

cd "${FRONTEND_DIST}"
${PYTHON_BIN} -m http.server "${FRONTEND_PORT}" >/dev/null 2>&1 &
FRONTEND_PID=$!

cd "${DOCS_DIST}"
${PYTHON_BIN} -m http.server "${DOCS_PORT}" >/dev/null 2>&1 &
DOCS_PID=$!

cleanup() {
  kill "${FRONTEND_PID}" "${DOCS_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait "${FRONTEND_PID}" "${DOCS_PID}"
