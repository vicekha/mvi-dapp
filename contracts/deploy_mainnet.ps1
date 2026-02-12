$ErrorActionPreference = "Stop"

<#
.SYNOPSIS
    Deploys contracts to Mainnet or Production-ready networks.
.DESCRIPTION
    This script is a parameterized version of the manual deployment script, designed for 
    targeting specific networks like Ethereum Mainnet, Polygon, or Reactive Mainnet.
.PARAMETER Network
    The name of the network to deploy to (as defined in foundry.toml). Default: "mainnet"
.PARAMETER RpcUrl
    Optional: Override the RPC URL. If not provided, foundry.toml settings are used via --rpc-url <Network>.
.PARAMETER Legacy
    Switch to use legacy transactions (often needed for older L2s or specific testnets).
#>
param (
    [string]$Network = "mainnet",
    [string]$RpcUrl = "",
    [switch]$Legacy
)

function Deploy-Contract {
    param (
        [string]$ContractName,
        [string]$ConstructorArgs,
        [string]$Signature
    )
    
    Write-Host "Deploying $ContractName to $Network..."
    
    $forgePath = "C:\Users\Dream\.foundry\bin\forge.exe"
    
    # Construct command
    $cmd = "& `"$forgePath`" create $Signature"
    
    if ($RpcUrl) {
        $cmd += " --rpc-url $RpcUrl"
    }
    else {
        $cmd += " --rpc-url $Network"
    }
    
    $cmd += " --private-key $env:PRIVATE_KEY --json"
    
    if ($Legacy) {
        $cmd += " --legacy"
    }
    
    if ($ConstructorArgs) {
        $cmd += " --constructor-args $ConstructorArgs"
    }
    
    $output = Invoke-Expression $cmd
    
    # Parse JSON output
    try {
        $json = $output | ConvertFrom-Json
        $addr = $json.deployedTo
        
        if (-not $addr) {
            throw "Address not found in output"
        }
        
        Write-Host "$ContractName deployed to: $addr"
        return $addr
    }
    catch {
        Write-Error "Failed to deploy $ContractName. Output: $output"
        exit 1
    }
}

Write-Host "STARTING PRODUCTION DEPLOYMENT TO: $Network"

# 1. VirtualLiquidityPool
$pool = Deploy-Contract "VirtualLiquidityPool" "" "src/VirtualLiquidityPool.sol:VirtualLiquidityPool"

# 2. AssetVerifier
$verifier = Deploy-Contract "AssetVerifier" "" "src/AssetVerifier.sol:AssetVerifier"

# 3. TrustWalletFeeDistributor
# IMPORTANT: Update this wallet address for PRODUCTION!
$trustWallet = "0x0dB12aAC15a63303d1363b8C862332C699Cca561" 
Write-Warning "Trust Wallet Fee Recipient is set to: $trustWallet. Ensure this is correct for Mainnet!"
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
$castCmd = "& `"$castPath`" send $processor `"setWalletSwapMain(address)`" $walletSwap"

if ($RpcUrl) {
    $castCmd += " --rpc-url $RpcUrl"
}
else {
    $castCmd += " --rpc-url $Network"
}

$castCmd += " --private-key $env:PRIVATE_KEY"
if ($Legacy) { $castCmd += " --legacy" }

Invoke-Expression $castCmd

Write-Host "DEPLOYMENT COMPLETE"
Write-Host "----------------------------------------"
Write-Host "VIRTUAL_LIQUIDITY_POOL= $pool"
Write-Host "ASSET_VERIFIER= $verifier"
Write-Host "FEE_DISTRIBUTOR= $distributor"
Write-Host "ORDER_PROCESSOR= $processor"
Write-Host "WALLET_SWAP_MAIN= $walletSwap"
Write-Host "----------------------------------------"
Write-Host "Save these addresses to frontend/src/config/contracts.ts under the correct Chain ID."
