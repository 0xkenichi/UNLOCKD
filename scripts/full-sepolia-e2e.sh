#!/bin/bash

# full-sepolia-e2e.sh
# Orchestrates a full End-to-End flow on the Sepolia testnet.
# Usage: ./scripts/full-sepolia-e2e.sh

set -e

# Source .env if it exists
if [ -f .env ]; then
  source .env
fi

echo "========================================="
echo "  UNLOCKD - Full Sepolia E2E Flow"
echo "========================================="

# 1. Check prerequisites
if [ -z "$ALCHEMY_SEPOLIA_URL" ]; then
    echo "❌ Error: ALCHEMY_SEPOLIA_URL environment variable is not set."
    echo "Please set it in your .env file or export it directly."
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY environment variable is not set."
    echo "Please set it in your .env file or export it directly."
    exit 1
fi

echo "✅ Environment variables verified."

# 2. Deploy Contracts
echo "🚀 Deploying contracts to Sepolia..."
npm run deploy:sepolia

# 3. Synchronize Frontend Contracts (if applicable)
echo "🔄 Synchronizing ABIs with Frontend..."
npm run sync:contracts:sepolia

# 4. Run E2E Flow
echo "⚙️  Running Sepolia E2E Script (e2e-sepolia.js)..."
npx hardhat run scripts/e2e-sepolia.js --network sepolia

echo "========================================="
echo "✅ Full Sepolia E2E Flow Completed Successfully!"
echo "========================================="
