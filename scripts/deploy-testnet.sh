#!/bin/bash
# Vestra Sovereign Build - Testnet Launch Script

echo "🚀 Initiating Vestra Sovereign Build Command..."

# 1. Backend Hardening & Oracle Start
echo "📡 Starting Vestra Backend & Oracles..."
cd packages/backend
npm install
npm run dev &
BACKEND_PID=$!

# 2. Deploy On-Chain Primitives (EVM)
echo "⛓️ Deploying Vestra Primitives to Sepolia..."
cd ../contracts
npm install
npx hardhat run scripts/deploy-sovereign.js --network sepolia

# 3. Frontend Activation
echo "🖥️ Starting Vestra UI..."
cd ../../frontend-v2
npm install
npm run dev &
FRONTEND_PID=$!

echo "✅ Vestra Protocol MVP is now active on Testnet."
echo "API: http://localhost:4000"
echo "Web: http://localhost:3000"

# Keep script running
wait $BACKEND_PID $FRONTEND_PID
