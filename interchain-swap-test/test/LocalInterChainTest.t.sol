// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/SwapMatcherRSC.sol";
import "../src/MockToken.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/AssetVerifier.sol";
import "../lib/reactive-lib/src/interfaces/ISystemContract.sol";
import "../lib/reactive-lib/src/interfaces/IReactive.sol";

contract LocalInterChainTest is Test {
    WalletSwapMain walletSwap;
    SwapMatcherRSC rsc;
    MockToken tokenA;
    MockToken tokenB;
    
    VirtualLiquidityPool pool;
    EulerLagrangeOrderProcessor processor;
    TrustWalletFeeDistributor feeDistributor;
    AssetVerifier assetVerifier;
    
    address user1 = address(0x100);
    address user2 = address(0x200);
    address service = address(0x999); // Mock service

    uint256 constant CHAIN_ID = 31337;

    event Callback(uint256 indexed chain_id, address indexed _contract, uint64 gas_limit, bytes payload);

    function setUp() public {
        vm.chainId(CHAIN_ID);

        // Deploy Dependencies
        tokenA = new MockToken("TokenA", "TKA");
        tokenB = new MockToken("TokenB", "TKB");
        
        pool = new VirtualLiquidityPool();
        processor = new EulerLagrangeOrderProcessor(address(pool));
        
        // Mocking fee distributor partially or deploy real one if valid
        // Assuming simple deploy works:
        feeDistributor = new TrustWalletFeeDistributor(address(0x111), address(0x222)); 
        assetVerifier = new AssetVerifier();
        
        walletSwap = new WalletSwapMain(
            address(pool),
            address(processor),
            address(feeDistributor),
            address(assetVerifier)
        );
        
        // Authorize Processor to call WalletSwap? No, other way around or shared
        processor.setWalletSwap(address(walletSwap)); // Hypothetical, check code if needed
        
        // Deploy RSC
        // We configure BOTH chains as CHAIN_ID to simulate local-only env behaving as inter-chain
        rsc = new SwapMatcherRSC(service, CHAIN_ID, CHAIN_ID, address(walletSwap), address(walletSwap));
        
        // Authorize RSC on WalletSwap
        walletSwap.setAuthorizedReactiveVM(address(rsc));
        // Set Callback Proxy to this test contract (self) so we can simulate callback? 
        // Or better, set it to a mock that forwards. 
        // For unit test of RSC, we just check RSC events.
        // For integration, we need to fake the callback.
        walletSwap.setCallbackProxy(address(this)); 

        // Mint tokens
        tokenA.mint(user1, 1000 ether);
        tokenB.mint(user2, 1000 ether);
        
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        
        // Approvals
        vm.startPrank(user1);
        tokenA.approve(address(walletSwap), type(uint256).max);
        tokenA.approve(address(processor), type(uint256).max); // Processor might move funds? 
        // WalletSwapMain uses transferFrom(msg.sender, ...) inside createOrder? 
        // No, createOrder just creates order. fulfillOrder/executeMatch moves funds.
        // Usually Processor holds allowance?
        // Let's check WalletSwapMain:
        // "IERC20(order.tokenIn).transferFrom(order.maker, ...)"
        // So User must approve WalletSwapMain or whoever calls transferFrom.
        // In executeCrossChainOrder: "IERC20(order.tokenIn).transferFrom(order.maker, beneficiary, ...)"
        // So User must approve WalletSwapMain.
        vm.stopPrank();

        vm.startPrank(user2);
        tokenB.approve(address(walletSwap), type(uint256).max);
        vm.stopPrank();
    }

    function testSimultaneousLocalTransfer() public {
        // 1. User 1 creates Order: Offer 100 TKA for 100 TKB
        vm.prank(user1);
        bytes32 order1 = walletSwap.createOrder{value: 0.01 ether}(
            address(tokenA), address(tokenB), 
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            100 ether, 100 ether, 0, 0, 0, 1 days, false, 0
        );

        // 2. User 2 creates Order: Offer 100 TKB for 100 TKA
        vm.prank(user2);
        bytes32 order2 = walletSwap.createOrder{value: 0.01 ether}(
            address(tokenB), address(tokenA), 
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            100 ether, 100 ether, 0, 0, 0, 1 days, false, 0
        );
        
    // 3. Simulate RSC Reaction for Order 1
        // Create LogRecord for OrderInitiated event
        IReactive.LogRecord memory log1 = IReactive.LogRecord({
             chain_id: CHAIN_ID,
             _contract: address(walletSwap),
             topic_0: 0x058e802e2eed1657b621419f51940b8d60d9ff78dca249f39084606796695333, // OrderInitiated
             topic_1: uint256(order1),
             topic_2: uint256(uint160(user1)),
             topic_3: 0,
             data: abi.encode(address(tokenA), address(tokenB), uint8(0), uint8(0), 100 ether, 100 ether, uint256(0), block.timestamp),
             block_number: block.number,
             op_code: 0,
             block_hash: 0,
             tx_hash: 0,
             log_index: 0
        });
        
        vm.prank(address(0)); // vmOnly
        rsc.react(log1);
        
        // Assert RSC stored the order (no match yet)
        assertEq(rsc.getOrderCount(CHAIN_ID, address(tokenA), address(tokenB)), 1);

        // 4. Simulate RSC Reaction for Order 2
        IReactive.LogRecord memory log2 = IReactive.LogRecord({
             chain_id: CHAIN_ID,
             _contract: address(walletSwap),
             topic_0: 0x058e802e2eed1657b621419f51940b8d60d9ff78dca249f39084606796695333,
             topic_1: uint256(order2),
             topic_2: uint256(uint160(user2)),
             topic_3: 0,
             data: abi.encode(address(tokenB), address(tokenA), uint8(0), uint8(0), 100 ether, 100 ether, uint256(0), block.timestamp),
             block_number: block.number,
             op_code: 0,
             block_hash: 0,
             tx_hash: 0,
             log_index: 0
        });

        // We expect callbacks!
        vm.expectEmit(true, true, true, true);
        emit Callback(CHAIN_ID, address(walletSwap), 5000000, 
            abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address)", address(rsc), order2, user1));
            
        vm.expectEmit(true, true, true, true);
        emit Callback(CHAIN_ID, address(walletSwap), 5000000, 
            abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address)", address(rsc), order1, user2));

        vm.prank(address(0)); // vmOnly
        rsc.react(log2);

        // 5. Verify Orders Removed from Pending
        // Candidates for TKB->TKA (which was Order 1) should be empty now
        assertEq(rsc.getOrderCount(CHAIN_ID, address(tokenA), address(tokenB)), 0); 
    }
}
