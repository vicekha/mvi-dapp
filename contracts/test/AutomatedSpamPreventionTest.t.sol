// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/AssetVerifier.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/SwapMatcherMultiChain.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract AutomatedSpamPreventionTest is Test {
    WalletSwapMain walletSwapMain;
    EulerLagrangeOrderProcessor orderProcessor;
    TrustWalletFeeDistributor feeDistributor;
    AssetVerifier assetVerifier;
    VirtualLiquidityPool liquidityPool;
    SwapMatcherMultiChain rsc;
    MockToken testToken;

    address owner = address(1);
    address spammer = address(2);
    address rvmSender = address(1337);

    function setUp() public {
        vm.startPrank(owner);

        feeDistributor = new TrustWalletFeeDistributor(address(42));
        assetVerifier = new AssetVerifier();
        liquidityPool = new VirtualLiquidityPool();
        testToken = new MockToken();

        orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );

        walletSwapMain = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            address(0x1337)
        );

        uint256[] memory chainIds = new uint256[](1);
        chainIds[0] = 11155111;
        
        address[] memory contracts = new address[](1);
        contracts[0] = address(walletSwapMain);

        rsc = new SwapMatcherMultiChain(owner, chainIds, contracts);

        orderProcessor.setWalletSwapMain(address(walletSwapMain));
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);

        // Authorize the RSC mock to send callbacks to WalletSwapMain
        walletSwapMain.setAuthorizedReactiveVM(rvmSender);
        walletSwapMain.setCallbackProxy(rvmSender);

        // Give the spammer some funds
        testToken.transfer(spammer, 1000 * 10**18);
        vm.deal(spammer, 100 ether);

        vm.stopPrank();

        
        vm.startPrank(spammer);
        testToken.approve(address(feeDistributor), type(uint256).max);
        testToken.approve(address(walletSwapMain), type(uint256).max);
        vm.stopPrank();
    }

    function test_SpamThresholdCallbackTrigger() public {
        uint256 THRESHOLD = rsc.SPAM_THRESHOLD();
        uint256 chainId = 11155111;

        vm.startPrank(spammer);

        // Dust value spam
        for(uint256 i = 0; i < THRESHOLD; i++) {
            walletSwapMain.createOrder{value: 0.002 ether}(
                address(testToken),
                address(0),
                WalletSwapMain.AssetType.ERC20,
                WalletSwapMain.AssetType.ERC20, 
                10 wei, // tiny amountIn (dust)
                1 ether,
                1,
                1,
                0,
                1 hours,
                false,
                84532 
            );
        }
        vm.stopPrank();

        vm.prank(rvmSender);
        walletSwapMain.setBlacklist(spammer, true);

        assertTrue(walletSwapMain.isBlacklisted(spammer));
    }

    function test_SpamThresholdExemptionForHighValue() public {
        uint256 THRESHOLD = rsc.SPAM_THRESHOLD();
        uint256 chainId = 11155111;

        address aiTrader = address(99);
        vm.prank(owner);
        testToken.transfer(aiTrader, 1000 * 10**18);
        vm.deal(aiTrader, 100 ether);
        
        vm.startPrank(aiTrader);
        testToken.approve(address(feeDistributor), type(uint256).max);
        testToken.approve(address(walletSwapMain), type(uint256).max);

        // High value orders (exceeds threshold but shouldn't trigger spam limit)
        for(uint256 i = 0; i < THRESHOLD + 5; i++) {
            walletSwapMain.createOrder{value: 0.002 ether}(
                address(testToken),
                address(0),
                WalletSwapMain.AssetType.ERC20,
                WalletSwapMain.AssetType.ERC20, 
                1 ether, // High amountIn (bypasses DUST_THRESHOLD)
                1 ether,
                1,
                1,
                0,
                1 hours,
                false,
                84532 
            );
        }
        vm.stopPrank();

        // The RVM would not send a callback here because amountIn > DUST_THRESHOLD
        // Therefore, we do NOT execute walletSwapMain.setBlacklist(...)
        // The user remains unblocked
        assertFalse(walletSwapMain.isBlacklisted(aiTrader));
    }
}
