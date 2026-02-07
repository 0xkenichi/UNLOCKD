#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export DEPLOYMENTS_NETWORK="${DEPLOYMENTS_NETWORK:-sepolia}"
export RPC_URL="${RPC_URL:-https://rpc.sepolia.org}"

echo "Starting MVP stack (frontend + backend)"
echo "Deployments: ${DEPLOYMENTS_NETWORK}"
echo "RPC URL: ${RPC_URL}"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:4000"

cd "${ROOT_DIR}"
npm run dev
