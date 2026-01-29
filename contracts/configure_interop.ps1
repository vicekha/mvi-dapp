$ErrorActionPreference = "Stop"

# Configuration
$lasnaRsc = "0x7cb6cbfbfb83e4754c4da9c86ffbb0b1788f6e94"
$sepoliaWalletSwap = "0xB8489abc7f5df9aDD04579bb74eC3C958D59Ee21"
$amoyWalletSwap = "0xAD18d2B0578388fc4078C1cd7037e7c05E04014C"

$sepoliaChainId = 11155111
$amoyChainId = 80002

try {
    # Load Credentials
    $env = Get-Content .env
    $key = ($env | Select-String "PRIVATE_KEY").ToString().Split('=')[1].Trim()
    
    # Load RPCs
    $lasnaRpc = ($env | Select-String "REACTIVE_RPC_URL").ToString().Split('=')[1].Trim()
    $sepoliaRpc = ($env | Select-String "SEPOLIA_RPC_URL").ToString().Split('=')[1].Trim()
    $amoyRpc = ($env | Select-String "POLYGON_AMOY_RPC_URL").ToString().Split('=')[1].Trim()

    Write-Host "--- Configuring Reactive Interoperability ---"

    # 1. Subscribe Lasna RSC to Sepolia Events
    Write-Host "`n[1/4] Subscribing Lasna RSC to Sepolia ($sepoliaChainId, $sepoliaWalletSwap)..."
    & "C:\Users\Dream\.foundry\bin\cast.exe" send $lasnaRsc "manualSubscribe(uint256,address)" $sepoliaChainId $sepoliaWalletSwap --rpc-url $lasnaRpc --private-key $key --legacy
    
    # 2. Subscribe Lasna RSC to Amoy Events
    Write-Host "`n[2/4] Subscribing Lasna RSC to Amoy ($amoyChainId, $amoyWalletSwap)..."
    & "C:\Users\Dream\.foundry\bin\cast.exe" send $lasnaRsc "manualSubscribe(uint256,address)" $amoyChainId $amoyWalletSwap --rpc-url $lasnaRpc --private-key $key --legacy

    # 3. Authorize RSC on Sepolia
    Write-Host "`n[3/4] Authorizing RSC on Sepolia..."
    & "C:\Users\Dream\.foundry\bin\cast.exe" send $sepoliaWalletSwap "setAuthorizedReactiveVM(address)" $lasnaRsc --rpc-url $sepoliaRpc --private-key $key --legacy

    # 4. Authorize RSC on Amoy
    Write-Host "`n[4/4] Authorizing RSC on Amoy..."
    & "C:\Users\Dream\.foundry\bin\cast.exe" send $amoyWalletSwap "setAuthorizedReactiveVM(address)" $lasnaRsc --rpc-url $amoyRpc --private-key $key --legacy

    Write-Host "`nConfiguration Complete!"
}
catch {
    Write-Error "Configuration Failed: $_"
}
