# SwapMatcherMultiChain Deployment Script (PowerShell)
# Deploys the full stack to Sonic Testnet.

Write-Host "=== Deploying SwapMatcherMultiChain to Sonic Testnet ===" -ForegroundColor Cyan

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

$RPC_URL = "https://rpc.testnet.soniclabs.com"

Write-Host "Deploying full stack to Sonic Testnet..." -ForegroundColor Yellow

& "C:\Users\Dream\.foundry\bin\forge.exe" script script/DeploySonic.s.sol:DeploySonic `
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
