# run_auth_sepolia.ps1
$ErrorActionPreference = "Stop"
Write-Host "Loading .env..."
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

if (-not $env:PRIVATE_KEY) { Write-Error "PRIVATE_KEY missing"; exit 1 }

Write-Host "Authorizing Sepolia..."
# Using public node, might need a few retries or higher gas price fallback if congested
forge script script/AuthorizeSepolia.s.sol:AuthorizeSepolia --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --legacy --skip-simulation -vvv
