$ErrorActionPreference = "Stop"
try {
    $content = Get-Content .env
    $key = ($content | Select-String "PRIVATE_KEY").ToString().Split('=')[1].Trim()
    $rpc = ($content | Select-String "SEPOLIA_RPC_URL").ToString().Split('=')[1].Trim()
    
    Write-Host "Deploying to Sepolia..."
    # Force recompile and broadcast
    & "C:\Users\Dream\.foundry\bin\forge.exe" script script/DeployFullStack.s.sol --rpc-url $rpc --broadcast --gas-limit 50000000 --force > deploy_sepolia_fixed.txt 2>&1
    
    Get-Content deploy_sepolia_fixed.txt
}
catch {
    Write-Error $_
}
