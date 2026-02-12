// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/BridgeSwapMain.sol";
import "../src/SwapBridgeRSC.sol";
import "../src/MockToken.sol";
import "reactive-lib/interfaces/IReactive.sol";

contract BridgeSwapTest is Test {
    BridgeSwapMain bridgeA;
    BridgeSwapMain bridgeB;
    SwapBridgeRSC rsc;
    MockToken tokenA;
    MockToken tokenB;

    address user = address(0x1);
    address service = address(0x999);
    uint256 constant CHAIN_A = 1;
    uint256 constant CHAIN_B = 2;

    event BridgeSwapRequested(
        bytes32 indexed orderId,
        address indexed maker,
        uint256 indexed targetChainId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 timestamp
    );

    event Callback(uint256 indexed chain_id, address indexed _contract, uint64 indexed gas_limit, bytes payload);

    function setUp() public {
        tokenA = new MockToken(); // FIXED: No args
        tokenB = new MockToken(); // FIXED: No args

        // Deploy Bridge contracts for two chains
        bridgeA = new BridgeSwapMain(address(0)); // RVM authorized check disabled for mock testing
        bridgeB = new BridgeSwapMain(address(0));

        // Deploy RSC
        rsc = new SwapBridgeRSC();
        rsc.setBridgeSwapMain(CHAIN_A, address(bridgeA));
        rsc.setBridgeSwapMain(CHAIN_B, address(bridgeB));

        // Setup liquidity on Bridge B for payout (simulating initial LP)
        tokenB.mint(address(this), 1000 ether);
        tokenB.approve(address(bridgeB), 1000 ether);
        bridgeB.provideLiquidity(address(tokenB), 1000 ether);

        // Setup user on Chain A
        tokenA.mint(user, 100 ether);
        vm.startPrank(user);
        tokenA.approve(address(bridgeA), 100 ether);
        vm.stopPrank();
    }

    function testCrossChainSwapFlow() public {
        // 1. User initiates swap on Chain A
        vm.prank(user);
        vm.chainId(CHAIN_A);
        bytes32 orderId = bridgeA.initiateSwap(address(tokenA), 10 ether, address(tokenB), CHAIN_B);

        // 2. Simulate Reactive Network catching the event
        // topic_3 is targetChainId (indexed)
        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: CHAIN_A,
            _contract: address(bridgeA),
            topic_0: uint256(keccak256("BridgeSwapRequested(bytes32,address,uint256,address,address,uint256,uint256)")),
            topic_1: uint256(orderId),
            topic_2: uint256(uint160(user)),
            topic_3: CHAIN_B,
            data: abi.encode(address(tokenA), address(tokenB), 10 ether, block.timestamp),
            block_number: block.number,
            op_code: 0,
            block_hash: 0,
            tx_hash: 0,
            log_index: 0
        });

        // We expect a callback to be emitted by the RSC
        vm.expectEmit(true, true, true, true);
        emit Callback(
            CHAIN_B,
            address(bridgeB),
            2000000,
            abi.encodeWithSignature(
                "executePayout(bytes32,address,address,uint256)",
                orderId,
                user,
                address(tokenB),
                10 ether // 1:1 rate
            )
        );

        rsc.react(log);

        // 3. Simulate Callback Execution on Chain B
        vm.chainId(CHAIN_B);
        // In real Reactive, the callback proxy calls this. Here we prank as address(0) since authorizedRVM is 0.
        bridgeB.executePayout(orderId, user, address(tokenB), 10 ether);

        // 4. Verify user received tokens on Chain B
        assertEq(tokenB.balanceOf(user), 10 ether);
        assertEq(tokenA.balanceOf(address(bridgeA)), 10 ether);
    }
}
