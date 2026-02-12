# Registration Script (PowerShell)
Write-Host "=== Registering Contracts on Lasna ===" -ForegroundColor Cyan

# Load environment variables from .env
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

if (-not $env:PRIVATE_KEY) {
    Write-Host "❌ PRIVATE_KEY not set in .env" -ForegroundColor Red
    exit 1
}

$RPC_URL = "https://lasna-rpc.rnk.dev/"

Write-Host "Running Registration Script..." -ForegroundColor Yellow

# Execute Forge Script
& "C:\Users\Dream\.foundry\bin\forge.exe" script script/SimpleRegister.s.sol:SimpleRegister `
    --rpc-url $RPC_URL `
    --broadcast `
    --legacy `
    --skip-simulation `
    -vvv

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Contract Registration Successful!" -ForegroundColor Green
} else {
    Write-Host "❌ Registration Failed!" -ForegroundColor Red
    exit 1
}
