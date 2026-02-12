#!/bin/bash

# MVI DApp Testnet Deployment Script
# This script deploys contracts to Sepolia and Lasna testnets

set -e  # Exit on error

echo "=== MVI DApp Testnet Deployment ==="
echo ""

# Load environment variables
source .env

# Check prerequisites
echo "Checking prerequisites..."

if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ PRIVATE_KEY not set in .env"
    exit 1
fi

if [ -z "$TRUST_WALLET" ]; then
    echo "❌ TRUST_WALLET not set in .env"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "   Fee Collector: $TRUST_WALLET"
echo ""

# Create deployments directory
mkdir -p deployments

# Function to deploy to a network
deploy_to_network() {
    NETWORK_NAME=$1
    RPC_URL=$2
    
    echo "=== Deploying to $NETWORK_NAME ==="
    echo "RPC: $RPC_URL"
    echo ""
    
    # Run deployment
    forge script script/DeployTestnet.s.sol:DeployTestnet \
        --rpc-url $RPC_URL \
        --broadcast \
        --legacy \
        -vvv
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment to $NETWORK_NAME successful!"
        echo ""
    else
        echo "❌ Deployment to $NETWORK_NAME failed!"
        exit 1
    fi
}

# Deploy to Sepolia
if [ "$1" == "sepolia" ] || [ "$1" == "all" ]; then
    deploy_to_network "Sepolia" "$SEPOLIA_RPC_URL"
fi

# Deploy to Lasna
if [ "$1" == "lasna" ] || [ "$1" == "all" ]; then
    deploy_to_network "Lasna (Reactive Network)" "$REACTIVE_RPC_URL"
fi

# If no argument provided, show usage
if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh [sepolia|lasna|all]"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh sepolia  # Deploy to Sepolia only"
    echo "  ./deploy.sh lasna    # Deploy to Lasna only"
    echo "  ./deploy.sh all      # Deploy to both networks"
    exit 0
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Check deployments/ folder for contract addresses"
echo "2. Update frontend/src/config/contracts.ts with new addresses"
echo "3. Test the DApp at http://localhost:3001"
echo ""
