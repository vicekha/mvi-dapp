# Deploy Demo Script
Write-Host "=== Deploying Callback Demo to Lasna ===" -ForegroundColor Cyan

# Load environment variables
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$RPC_URL = "https://lasna-rpc.rnk.dev/"

& "C:\Users\Dream\.foundry\bin\forge.exe" script script/DeployCallbackDemo.s.sol:DeployCallbackDemo `
    --rpc-url $RPC_URL `
    --broadcast `
    --legacy `
    --skip-simulation `
    -vvv
