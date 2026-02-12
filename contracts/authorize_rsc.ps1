# Authorize RSC Script
Write-Host "=== Authorizing RSC on Sepolia and Lasna ===" -ForegroundColor Cyan

# Load .env
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com"
$LASNA_RPC = "https://lasna-rpc.rnk.dev/"

Write-Host "Authorizing on Sepolia..." -ForegroundColor Yellow
& "C:\Users\Dream\.foundry\bin\forge.exe" script script/AuthorizeSepolia.s.sol:AuthorizeSepolia `
    --rpc-url $SEPOLIA_RPC `
    --broadcast `
    --legacy `
    --skip-simulation `
    -vvv

if ($LASTEXITCODE -ne 0) { Write-Host "Sepolia Auth Failed" -ForegroundColor Red; exit 1 }

Write-Host "Authorizing on Lasna..." -ForegroundColor Yellow
& "C:\Users\Dream\.foundry\bin\forge.exe" script script/AuthorizeLasna.s.sol:AuthorizeLasna `
    --rpc-url $LASNA_RPC `
    --broadcast `
    --legacy `
    --skip-simulation `
    -vvv

if ($LASTEXITCODE -ne 0) { Write-Host "Lasna Auth Failed" -ForegroundColor Red; exit 1 }

Write-Host "✅ Authorization Complete!" -ForegroundColor Green
