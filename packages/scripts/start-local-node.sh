#!/bin/bash
# Robust local node startup script

PORT=8545

echo "Checking for existing node on port $PORT..."
PID=$(lsof -ti:$PORT)
if [ ! -z "$PID" ]; then
  echo "Killing existing process $PID..."
  kill -9 $PID
  sleep 2
fi

echo "Starting Hardhat node..."
npx hardhat node > hardhat_node.log 2>&1 &
NODE_PID=$!

echo "Waiting for node to be ready..."
MAX_RETRIES=15
COUNT=0
until curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://127.0.0.1:$PORT > /dev/null
do
  COUNT=$((COUNT+1))
  if [ $COUNT -ge $MAX_RETRIES ]; then
    echo "Timeout waiting for node."
    kill $NODE_PID
    exit 1
  fi
  sleep 1
done

echo "Node is ready (PID: $NODE_PID). Deploying contracts..."
npx hardhat deploy --reset --network localhost

if [ $? -eq 0 ]; then
  echo "Deployment successful."
else
  echo "Deployment failed."
  exit 1
fi
