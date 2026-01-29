# Deploy RSC Final
$RPC = "https://lasna-rpc.rnk.dev/"
$FORGE = "C:\Users\Dream\.foundry\bin\forge.exe"
$REC_ADDR = "0x6CE99DCc53c9AC268Af55Ad09714f4943D6322"
$ARGS = "11155111 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd 5318007 $REC_ADDR"

Write-Host "Deploying RSC with args: $ARGS"

& $FORGE create src/demos/SimpleCallbackRSC.sol:SimpleCallbackRSC `
    --constructor-args 11155111 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd 5318007 $REC_ADDR `
    --rpc-url $RPC `
    --private-key $env:PRIVATE_KEY `
    --legacy 
