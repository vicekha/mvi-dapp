# run_auth_lasna.ps1
$ErrorActionPreference = "Stop"
Write-Host "Loading .env..."
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

if (-not $env:PRIVATE_KEY) { Write-Error "PRIVATE_KEY missing"; exit 1 }

Write-Host "Authorizing Lasna..."
forge script script/AuthorizeLasna.s.sol:AuthorizeLasna --rpc-url https://lasna-rpc.rnk.dev/ --broadcast --legacy --skip-simulation -vvv
