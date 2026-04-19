$env:PRIVATE_KEY = (Get-Content .env | Where-Object { $_ -match "^PRIVATE_KEY=(.*)" } | ForEach-Object { $matches[1] })

$env:MOCK_ADDRESS = "0xe229ea3f70675889cb409989c8e5e34b760e853f"
$env:USDC_ADDRESS = "0x3ffacda240703bfb9390a91bf3def37b00438322"
$env:USDT_ADDRESS = "0xe4350b201f0ce0e720993c03a0c5c45fa6a84a4f"

$env:RED_ADDRESS = "0x7c0f5066b4d17c385eb5f4c71b2cfab8d3609090"
$env:BLUE_ADDRESS = "0x2418440a792ca7e307750d0407b16ee97042f512"
$env:WHITE_ADDRESS = "0x50a51ae44abfd5e43421957b43489029f91286ca"

Write-Host "=== Minting Mock Tokens & NFTs to Deployer on Sonic Testnet ==="
forge script script/MintTestAssets.s.sol:MintTestAssets --rpc-url https://rpc.testnet.soniclabs.com --broadcast --legacy

Write-Host "Done!"
