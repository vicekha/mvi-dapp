$env:PRIVATE_KEY = (Get-Content .env | Where-Object { $_ -match "^PRIVATE_KEY=(.*)" } | ForEach-Object { $matches[1] })

Write-Host "=== Deploying AutoSwap to Flare Coston2 Testnet ==="
forge script script/DeployCoston2.s.sol:DeployCoston2 --rpc-url https://coston2-api.flare.network/ext/C/rpc --broadcast --legacy

Write-Host "Done!"
