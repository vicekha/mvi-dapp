$ErrorActionPreference = "Stop"
try {
    # Load .env
    $env = Get-Content .env
    
    # Extract Key
    $keyLine = $env | Select-String "PRIVATE_KEY"
    if (-not $keyLine) { throw "PRIVATE_KEY not found in .env" }
    $key = $keyLine.ToString().Split('=')[1].Trim()

    # Extract RPCs
    $sepoliaRpcLine = $env | Select-String "SEPOLIA_RPC_URL"
    $sepoliaRpc = if ($sepoliaRpcLine) { $sepoliaRpcLine.ToString().Split('=')[1].Trim() } else { "https://rpc.sepolia.org" }
    
    $amoyRpcLine = $env | Select-String "POLYGON_AMOY_RPC_URL"
    $amoyRpc = if ($amoyRpcLine) { $amoyRpcLine.ToString().Split('=')[1].Trim() } else { "https://rpc-amoy.polygon.technology" }

    # Derby Address
    Write-Host "--- Wallet Diagnostics ---"
    Write-Host "Deriving address from PRIVATE_KEY..."
    $address = (& "C:\Users\Dream\.foundry\bin\cast.exe" wallet address --private-key $key)
    Write-Host "Derived Address: $address"
    Write-Host ""

    # Check Sepolia
    Write-Host "Checking Sepolia Balance ($sepoliaRpc)..."
    $sepoliaBal = (& "C:\Users\Dream\.foundry\bin\cast.exe" balance $address --rpc-url $sepoliaRpc)
    Write-Host "Sepolia Balance: $sepoliaBal wei"
    Write-Host "Sepolia Balance: $([math]::Round($sepoliaBal / 1e18, 4)) ETH"
    Write-Host ""

    # Check Amoy
    Write-Host "Checking Amoy Balance ($amoyRpc)..."
    try {
        $amoyBal = (& "C:\Users\Dream\.foundry\bin\cast.exe" balance $address --rpc-url $amoyRpc)
        Write-Host "Amoy Balance: $amoyBal wei"
    }
    catch {
        Write-Host "Failed to check Amoy balance: $_"
    }

}
catch {
    Write-Error $_
}
