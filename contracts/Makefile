.PHONY: help build test deploy deploy-lasna clean verify

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
NC := \033[0m # No Color

help:
	@echo "$(BLUE)MVI Reactive Network Smart Contracts$(NC)"
	@echo ""
	@echo "Available commands:"
	@echo "  $(GREEN)make build$(NC)              - Build contracts"
	@echo "  $(GREEN)make test$(NC)               - Run tests"
	@echo "  $(GREEN)make deploy$(NC)             - Deploy to Lasna testnet"
	@echo "  $(GREEN)make deploy-lasna$(NC)       - Deploy to Lasna testnet (same as deploy)"
	@echo "  $(GREEN)make clean$(NC)              - Clean build artifacts"
	@echo "  $(GREEN)make verify$(NC)             - Verify contracts on Etherscan"
	@echo "  $(GREEN)make gas-report$(NC)         - Generate gas report"
	@echo ""

build:
	@echo "$(BLUE)Building contracts...$(NC)"
	forge build

test:
	@echo "$(BLUE)Running tests...$(NC)"
	forge test -vv

test-gas:
	@echo "$(BLUE)Running tests with gas report...$(NC)"
	forge test --gas-report

deploy-lasna:
	@echo "$(BLUE)Deploying to Lasna Testnet...$(NC)"
	@if [ -z "$(PRIVATE_KEY)" ]; then \
		echo "$(RED)Error: PRIVATE_KEY environment variable not set$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(TRUST_WALLET)" ]; then \
		echo "$(RED)Error: TRUST_WALLET environment variable not set$(NC)"; \
		exit 1; \
	fi
	forge script script/DeployLasna.s.sol:DeployLasnaScript \
		--rpc-url https://rpc.lasna.reactive.network \
		--private-key $(PRIVATE_KEY) \
		--broadcast \
		-vv

deploy: deploy-lasna

clean:
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	forge clean
	rm -rf cache out

verify:
	@echo "$(BLUE)Verifying contracts...$(NC)"
	@echo "$(RED)Note: Verify contracts manually on Etherscan$(NC)"

gas-report:
	@echo "$(BLUE)Generating gas report...$(NC)"
	forge test --gas-report > gas-report.txt
	@echo "$(GREEN)Gas report saved to gas-report.txt$(NC)"

fmt:
	@echo "$(BLUE)Formatting code...$(NC)"
	forge fmt

lint:
	@echo "$(BLUE)Linting code...$(NC)"
	@echo "$(RED)Note: Install solhint for linting$(NC)"

# Development helpers
setup:
	@echo "$(BLUE)Setting up development environment...$(NC)"
	@echo "$(GREEN)1. Install Foundry:$(NC)"
	@echo "   curl -L https://foundry.paradigm.xyz | bash"
	@echo "   foundryup"
	@echo ""
	@echo "$(GREEN)2. Set environment variables:$(NC)"
	@echo "   export PRIVATE_KEY=your_private_key"
	@echo "   export TRUST_WALLET=your_trust_wallet_address"
	@echo ""

info:
	@echo "$(BLUE)Contract Information:$(NC)"
	@echo ""
	@echo "$(GREEN)Lasna Testnet RPC:$(NC)"
	@echo "  https://rpc.lasna.reactive.network"
	@echo ""
	@echo "$(GREEN)System Contract Address:$(NC)"
	@echo "  0x0000000000000000000000000000000000fffFfF"
	@echo ""
	@echo "$(GREEN)Deployed Contracts:$(NC)"
	@echo "  VirtualLiquidityPool"
	@echo "  EulerLagrangeOrderProcessor"
	@echo "  TrustWalletFeeDistributor"
	@echo "  AssetVerifier"
	@echo "  WalletSwapMain"
	@echo "  ReactiveHyperlaneBridge"
	@echo ""

# Quick test commands
test-fee-calculation:
	@echo "$(BLUE)Testing fee calculation...$(NC)"
	forge test -k testFeeCalculation -vv

test-debt-coverage:
	@echo "$(BLUE)Testing debt coverage...$(NC)"
	forge test -k testDebtCoverage -vv

test-integration:
	@echo "$(BLUE)Running integration tests...$(NC)"
	forge test -k testComponentIntegration -vv

# Deployment verification
verify-deployment:
	@echo "$(BLUE)Verifying deployment...$(NC)"
	@echo "$(GREEN)Check the deployment addresses above$(NC)"
	@echo "$(GREEN)Verify on Reactive Network explorer:$(NC)"
	@echo "  https://lasna.reactscan.net"

# Documentation
docs:
	@echo "$(BLUE)Building documentation...$(NC)"
	@echo "$(GREEN)Documentation files:$(NC)"
	@echo "  - README.md"
	@echo "  - DEPLOYMENT_GUIDE.md"
	@echo "  - REACTIVE_NETWORK_INTEGRATION.md"
	@echo "  - FEE_BASED_DEBT_COVERAGE_GUIDE.md"
	@echo "  - NON_CUSTODIAL_SWAP_DOCUMENTATION.md"
