#!/usr/bin/env bash
#
# One-command local demo: starts Hardhat node, deploys contracts, seeds sample vest,
# then runs backend + frontend. Use this for a fully functional local borrow demo.
#
# Usage: ./scripts/demo-local.sh
#
# Prerequisites: npm install (root, backend, frontend)
#
# Output: Frontend at http://localhost:5173, Backend at http://localhost:4000
# Collateral ID and vesting address printed after seed step - use them in Borrow flow.
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[demo]${NC} $*"; }
warn() { echo -e "${YELLOW}[demo]${NC} $*"; }
err() { echo -e "${RED}[demo]${NC} $*"; }

# Trap to kill background processes on exit
NODE_PID=""
cleanup() {
  if [[ -n "${NODE_PID}" ]] && kill -0 "${NODE_PID}" 2>/dev/null; then
    log "Stopping Hardhat node (pid ${NODE_PID})..."
    kill "${NODE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

log "Starting local demo stack..."
log ""

# 1. Start Hardhat node
log "1/5 Starting Hardhat node (localhost:8545)..."
npx hardhat node --no-deploy > /tmp/hardhat-node.log 2>&1 &
NODE_PID=$!

# Wait for node to be ready
MAX_WAIT=30
for i in $(seq 1 ${MAX_WAIT}); do
  if curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 >/dev/null 2>&1; then
    log "   Node ready."
    break
  fi
  if [[ ${i} -eq ${MAX_WAIT} ]]; then
    err "Hardhat node failed to start. Check /tmp/hardhat-node.log"
    exit 1
  fi
  sleep 1
done

# 2. Deploy contracts to localhost
log "2/5 Deploying contracts..."
npx hardhat deploy --network localhost --tags full

# 3. Seed sample vest (1h cliff, 3h total)
log "3/5 Seeding sample vest and pool..."
SEED_OUTPUT=$(npx hardhat run scripts/seed-sample-vest.js --network localhost 2>&1)
echo "${SEED_OUTPUT}"

# Extract collateral ID and vesting address from output for convenience
COLLATERAL_ID=$(echo "${SEED_OUTPUT}" | grep -oE "Collateral ID \(use in UI for escrow + borrow\): [0-9]+" | grep -oE "[0-9]+" | tail -1 || true)
VESTING_ADDR=$(echo "${SEED_OUTPUT}" | grep "Vesting contract:" | awk '{print $3}' || true)

log "Verification of extracted IDs:"
log "  COLLATERAL_ID: ${COLLATERAL_ID}"
log "  VESTING_ADDR:   ${VESTING_ADDR}"

log ""
log "--- Use these in the Borrow UI ---"
if [[ -n "${COLLATERAL_ID}" ]]; then
  log "Collateral ID:    ${COLLATERAL_ID}"
fi
if [[ -n "${VESTING_ADDR}" ]]; then
  log "Vesting contract: ${VESTING_ADDR}"
fi
log ""

# 4 & 5. Start backend + frontend
log "4/5 Starting backend (port 4000)..."
log "5/5 Starting frontend-v2 (port 3000)..."
log ""
log "Open http://localhost:3000 and connect wallet to Localhost (chain 31337)"
log ""

export EVM_RELAYER_RPC_URL=http://127.0.0.1:8545
export EVM_RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

npm run dev:services
