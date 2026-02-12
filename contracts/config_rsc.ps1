$envContent = Get-Content .env
foreach ($line in $envContent) {
    if ($line -match '^PRIVATE_KEY=(.*)') {
        $env:PRIVATE_KEY = $matches[1]
    }
}

$RSC = "0x6aa307e69cde3277cac727edce689c53dd52437b"
$WS_SEPOLIA = "0xee6ae31203b1aa59dd2c0a19e3521d4c1ab088f6"
$WS_LASNA = "0xd98b754dfd5235343ae9a0fd07a715ee68fdfb8f"
$RPC_LASNA = "https://lasna-rpc.rnk.dev/"
$RPC_SEPOLIA = "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b"

Write-Host "Updating RSC..."
cast send $RSC "updateWalletSwaps(address,address)" $WS_SEPOLIA $WS_LASNA --rpc-url $RPC_LASNA --private-key $env:PRIVATE_KEY --legacy

Write-Host "Authorizing Lasna..."
cast send $WS_LASNA "setAuthorizedReactiveVM(address)" $RSC --rpc-url $RPC_LASNA --private-key $env:PRIVATE_KEY --legacy

Write-Host "Authorizing Sepolia..."
cast send $WS_SEPOLIA "setAuthorizedReactiveVM(address)" $RSC --rpc-url $RPC_SEPOLIA --private-key $env:PRIVATE_KEY --legacy
