$ErrorActionPreference = "Stop"
try {
    $content = Get-Content .env
    $key = ($content | Select-String "PRIVATE_KEY").ToString().Split('=')[1].Trim()
    $rpc = ($content | Select-String "SEPOLIA_RPC_URL").ToString().Split('=')[1].Trim()
    
    Write-Host "Checking balance..."
    & "C:\Users\Dream\.foundry\bin\cast.exe" balance 0xB133a1948934341079256827806283737b4b1237 --rpc-url $rpc

    Write-Host "Cleaning..."
    & "C:\Users\Dream\.foundry\bin\forge.exe" clean

    Write-Host "Running Full Stack Deployment..."
    & "C:\Users\Dream\.foundry\bin\forge.exe" script script/DeployFullStack.s.sol --rpc-url $rpc --broadcast --gas-limit 5000000 --force > deploy.txt 2>&1
}
catch {
    Write-Error $_
    exit 1
}
