# MVI DApp Testnet Deployment Script (PowerShell)
# This script deploys contracts to Sepolia and Lasna testnets

param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("sepolia", "lasna", "all")]
    [string]$Network = ""
)

Write-Host "=== MVI DApp Testnet Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not $env:PRIVATE_KEY) {
    Write-Host "❌ PRIVATE_KEY not set in .env" -ForegroundColor Red
    exit 1
}

if (-not $env:TRUST_WALLET) {
    Write-Host "❌ TRUST_WALLET not set in .env" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Environment variables loaded" -ForegroundColor Green
Write-Host "   Fee Collector: $env:TRUST_WALLET"
Write-Host ""

# Create deployments directory
New-Item -ItemType Directory -Force -Path deployments | Out-Null

# Function to deploy to a network
function Deploy-ToNetwork {
    param(
        [string]$NetworkName,
        [string]$RpcUrl
    )
    
    Write-Host "=== Deploying to $NetworkName ===" -ForegroundColor Cyan
    Write-Host "RPC: $RpcUrl"
    Write-Host ""
    
    # Run deployment
    & forge script script/DeployTestnet.s.sol:DeployTestnet `
        --rpc-url $RpcUrl `
        --broadcast `
        --legacy `
        -vvv
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Deployment to $NetworkName successful!" -ForegroundColor Green
        Write-Host ""
    }
    else {
        Write-Host "❌ Deployment to $NetworkName failed!" -ForegroundColor Red
        exit 1
    }
}

# Deploy based on parameter
switch ($Network) {
    "sepolia" {
        Deploy-ToNetwork -NetworkName "Sepolia" -RpcUrl $env:SEPOLIA_RPC_URL
    }
    "lasna" {
        Deploy-ToNetwork -NetworkName "Lasna (Reactive Network)" -RpcUrl $env:REACTIVE_RPC_URL
    }
    "all" {
        Deploy-ToNetwork -NetworkName "Sepolia" -RpcUrl $env:SEPOLIA_RPC_URL
        Deploy-ToNetwork -NetworkName "Lasna (Reactive Network)" -RpcUrl $env:REACTIVE_RPC_URL
    }
    default {
        Write-Host "Usage: .\deploy.ps1 -Network [sepolia|lasna|all]" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\deploy.ps1 -Network sepolia  # Deploy to Sepolia only"
        Write-Host "  .\deploy.ps1 -Network lasna    # Deploy to Lasna only"
        Write-Host "  .\deploy.ps1 -Network all      # Deploy to both networks"
        exit 0
    }
}

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Check deployments\ folder for contract addresses"
Write-Host "2. Update frontend\src\config\contracts.ts with new addresses"
Write-Host "3. Test the DApp at http://localhost:3001"
Write-Host ""
