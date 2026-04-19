# SwapMatcherMultiChain Deployment Script (PowerShell)
# Deploys the full stack (WalletSwapMain core + SwapMatcherMultiChain RSC) to Lasna.
# Set peer-chain addresses in .env as SEPOLIA_WALLET_SWAP and BASE_SEPOLIA_WALLET_SWAP
# if those chains are already deployed.

Write-Host "=== Deploying SwapMatcherMultiChain to Lasna ===" -ForegroundColor Cyan

# Load environment variables from .env
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

if (-not $env:PRIVATE_KEY) {
    Write-Host "❌ PRIVATE_KEY not set in .env" -ForegroundColor Red
    exit 1
}

$RPC_URL = "https://lasna-rpc.rnk.dev/"

Write-Host "Deploying full stack to Lasna..." -ForegroundColor Yellow

& "C:\Users\Dream\.foundry\bin\forge.exe" script script/DeployLasna.s.sol:DeployLasna `
    --rpc-url $RPC_URL `
    --broadcast `
    --legacy `
    --skip-simulation `
    -vvv

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Deployment Successful!" -ForegroundColor Green
}
else {
    Write-Host "❌ Deployment Failed!" -ForegroundColor Red
    exit 1
}
