$ErrorActionPreference = "Stop"

function Deploy-Contract {
    param (
        [string]$ContractName,
        [string]$Args,
        [string]$Signature
    )
    
    Write-Host "Deploying $ContractName..."
    
    $forgePath = "C:\Users\Dream\.foundry\bin\forge.exe"
    $cmd = "& `"$forgePath`" create $Signature --rpc-url https://lasna-rpc.rnk.dev/ --private-key $env:PRIVATE_KEY --legacy --json"
    if ($Args) {
        $cmd += " --constructor-args $Args"
    }
    
    # Write-Host "Command: $cmd"
    $output = Invoke-Expression $cmd
    # Parse JSON output from the last line (sometimes forge prints logs before json)
    # Actually forge create --json prints everything as json? Or mixed.
    # We join output and find the JSON blob.
    
    # Simple regex for address in standard output or json
    $json = $output | ConvertFrom-Json
    $addr = $json.deployedTo
    
    if (-not $addr) {
        Write-Error "Failed to deploy $ContractName. Output: $output"
    }
    
    Write-Host "$ContractName deployed to: $addr"
    return $addr
}

# 1. VirtualLiquidityPool
$pool = Deploy-Contract "VirtualLiquidityPool" "" "src/VirtualLiquidityPool.sol:VirtualLiquidityPool"

# 2. AssetVerifier
$verifier = Deploy-Contract "AssetVerifier" "" "src/AssetVerifier.sol:AssetVerifier"

# 3. TrustWalletFeeDistributor
$trustWallet = "0x0dB12aAC15a63303d1363b8C862332C699Cca561"
$distributor = Deploy-Contract "TrustWalletFeeDistributor" $trustWallet "src/TrustWalletFeeDistributor.sol:TrustWalletFeeDistributor"

# 4. EulerLagrangeOrderProcessor
$procArgs = "$pool $distributor $verifier"
$processor = Deploy-Contract "EulerLagrangeOrderProcessor" $procArgs "src/EulerLagrangeOrderProcessor.sol:EulerLagrangeOrderProcessor"

# 5. WalletSwapMain
$mainArgs = "$pool $processor $distributor $verifier"
$walletSwap = Deploy-Contract "WalletSwapMain" $mainArgs "src/WalletSwapMain.sol:WalletSwapMain"

# Setup: Processor setWalletSwap
Write-Host "Setting WalletSwapMain on OrderProcessor..."
$castPath = "C:\Users\Dream\.foundry\bin\cast.exe"
& $castPath send $processor "setWalletSwapMain(address)" $walletSwap --rpc-url https://lasna-rpc.rnk.dev/ --private-key $env:PRIVATE_KEY --legacy

# 6. SwapMatcherRSC
$systemContract = "0x0000000000000000000000000000000000fffFfF"
$sepoliaChainId = "11155111"
$amoyChainId = "80002"
$l1Wallet = "0xB8489abc7f5df9aDD04579bb74eC3C958D59Ee21"
$amoyWallet = "0xAD18d2B0578388fc4078C1cd7037e7c05E04014C"

$rscArgs = "$systemContract $sepoliaChainId $amoyChainId $l1Wallet $amoyWallet"
$rsc = Deploy-Contract "SwapMatcherRSC" $rscArgs "src/SwapMatcherRSC.sol:SwapMatcherRSC"

# Output for parsing
Write-Host "LASNA_MANUAL_DEPLOYMENT_COMPLETE"
Write-Host "LASNA_LIQUIDITY_POOL= $pool"
Write-Host "LASNA_ASSET_VERIFIER= $verifier"
Write-Host "LASNA_FEE_DISTRIBUTOR= $distributor"
Write-Host "LASNA_ORDER_PROCESSOR= $processor"
Write-Host "LASNA_WALLET_SWAP_MAIN= $walletSwap"
Write-Host "LASNA_SWAP_MATCHER_RSC= $rsc"
