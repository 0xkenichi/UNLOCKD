#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building frontend..."
cd "${ROOT_DIR}/frontend"
npm install --legacy-peer-deps
npm run build

echo "Building docs site..."
cd "${ROOT_DIR}/docs-site"
npm install --legacy-peer-deps
npm run build

echo "Packaging demo-build.tar.gz..."
cd "${ROOT_DIR}"
tar -czf demo-build.tar.gz frontend/dist docs-site/dist

echo "Done. Artifact: ${ROOT_DIR}/demo-build.tar.gz"
