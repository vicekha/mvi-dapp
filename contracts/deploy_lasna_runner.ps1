$ErrorActionPreference = "Stop"
try {
    $content = Get-Content .env
    $key = ($content | Select-String "PRIVATE_KEY").ToString().Split('=')[1].Trim()
    
    # Prioritize REACTIVE_RPC_URL, fallback to known endpoint if missing
    $rpcLine = $content | Select-String "REACTIVE_RPC_URL"
    if ($rpcLine) {
        $rpc = $rpcLine.ToString().Split('=')[1].Trim()
    }
    else {
        $rpc = "https://lasna-rpc.rnk.dev/"
    }
    
    Write-Host "Deploying to Lasna ($rpc)..."
    & "C:\Users\Dream\.foundry\bin\forge.exe" script script/DeployLasna.s.sol --rpc-url $rpc --broadcast --gas-limit 5000000 --legacy > deploy_lasna.txt 2>&1
    
    Get-Content deploy_lasna.txt
}
catch {
    Write-Error $_
}
