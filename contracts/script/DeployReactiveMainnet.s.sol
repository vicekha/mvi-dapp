// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";
import "../src/SwapMatcherMultiChain.sol";

contract DeployReactiveMainnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address trustWallet = vm.envOr("DEFAULT_TRUST_WALLET", address(0x0dB12aAC15a63303d1363b8C862332C699Cca561));

        vm.startBroadcast(deployerPrivateKey);

        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        AssetVerifier assetVerifier = new AssetVerifier();
        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);

        EulerLagrangeOrderProcessor orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );

        WalletSwapMain walletSwap = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            address(0) // Set later
        );

        orderProcessor.setWalletSwapMain(address(walletSwap));

        // Security Configuration (New)
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(walletSwap), true);
        console.log("Authorized callers for LiquidityPool");

        orderProcessor.setMinimumOrderValue(0.01 ether);
        feeDistributor.setMinFeeMinutes(15);
        feeDistributor.setMinNftFeeWei(0.005 ether);
        console.log("Configured FeeDistributor minimums");

        uint256[] memory initialIds = new uint256[](0);
        address[] memory initialAddrs = new address[](0);

        console.log("Deploying RSC...");
        SwapMatcherMultiChain rsc = new SwapMatcherMultiChain(
            deployer,
            initialIds,
            initialAddrs
        );
        console.log("RSC deployed at:", address(rsc));

        console.log("Funding RSC with 100 REACT for callback gas...");
        (bool fundSuccess,) = payable(address(rsc)).call{value: 100 ether}(""); // Fund with 100 REACT
        require(fundSuccess, "Funding failed");
        console.log("RSC successfully funded.");

        console.log("Configuring RSC chains...");
        
        // 1. Reactive Mainnet (Self)
        try rsc.addChainOffline(1597, address(walletSwap)) {
            console.log("Added Reactive Mainnet chain.");
        } catch Error(string memory reason) {
            console.log("Failed to add Reactive Mainnet chain:", reason);
        } catch (bytes memory data) {
            console.log("Failed to add Reactive Mainnet chain (bytes length):", data.length);
        }
        
        // 2. Sonic Mainnet (Remote)
        address sonicWallet = 0xeE147983132A1b861d1a6A8DeB93eb25A48B403f;
        if (sonicWallet != address(0)) {
            try rsc.addChainOffline(146, sonicWallet) {
                console.log("Registered Sonic Mainnet chain:", sonicWallet);
            } catch Error(string memory reason) {
                console.log("Failed to add Sonic chain:", reason);
            } catch (bytes memory data) {
                console.log("Failed to add Sonic chain (bytes length):", data.length);
            }
        }

        console.log("Setting RSC on WalletSwap...");
        walletSwap.setAuthorizedReactiveVM(address(rsc));
        walletSwap.setCallbackProxy(address(rsc));
        console.log("Config finished.");

        vm.stopBroadcast();

        console.log("DEPLOYMENT_COMPLETE");
        console.log("WALLET_SWAP_MAIN=",  address(walletSwap));
        console.log("ORDER_PROCESSOR=",   address(orderProcessor));
        console.log("FEE_DISTRIBUTOR=",   address(feeDistributor));
        console.log("ASSET_VERIFIER=",    address(assetVerifier));
        console.log("LIQUIDITY_POOL=",    address(liquidityPool));
        console.log("SWAP_MATCHER_RSC=",  address(rsc));
    }
}
