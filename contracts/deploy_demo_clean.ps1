# Clean Demo Deployment
$ErrorActionPreference = "Stop"

# Load Env
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

$RPC = "https://lasna-rpc.rnk.dev/"
$FORGE = "C:\Users\Dream\.foundry\bin\forge.exe"

Write-Host "Deploying Receiver..."
$jsonOut = & $FORGE create src/demos/SimpleCallbackReceiver.sol:SimpleCallbackReceiver --rpc-url $RPC --private-key $env:PRIVATE_KEY --legacy --json
Write-Host "DEBUG RAW RECEIVER: $jsonOut"
$outRec = $jsonOut | ConvertFrom-Json
$recAddr = $outRec.deployedTo

Write-Host "Receiver Deployed at: $recAddr"

Write-Host "Deploying RSC..."
# RSC Constructor: (uint256 _originChainId, address _originToken, uint256 _destinationChainId, address _callbackReceiver)
# Sepolia ChainID: 11155111
# Sepolia MockNFT: 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd
# Lasna ChainID: 5318007
$args = "11155111 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd 5318007 $recAddr"

$outRsc = & $FORGE create src/demos/SimpleCallbackRSC.sol:SimpleCallbackRSC --constructor-args 11155111 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd 5318007 $recAddr --rpc-url $RPC --private-key $env:PRIVATE_KEY --legacy --json | ConvertFrom-Json
$rscAddr = $outRsc.deployedTo

Write-Host "RSC Deployed at: $rscAddr"

$output = @{
    Receiver = $recAddr
    RSC = $rscAddr
}

$output | ConvertTo-Json | Out-File "demo_addresses.json" -Encoding UTF8
Write-Host "Addresses saved to demo_addresses.json"
