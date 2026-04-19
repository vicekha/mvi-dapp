$env:PRIVATE_KEY = (Get-Content .env | Where-Object { $_ -match "^PRIVATE_KEY=(.*)" } | ForEach-Object { $matches[1] })

Write-Host "=== Deploying Mock Tokens to Sonic Testnet ==="
forge script script/DeployTokensAndNFTs.s.sol:DeployTokensAndNFTs --rpc-url https://rpc.testnet.soniclabs.com --broadcast --legacy

Write-Host "Done!"
