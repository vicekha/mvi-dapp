// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/BridgeSwapMain.sol";
import "../src/SwapBridgeRSC.sol";
import "../src/MockToken.sol";
import "reactive-lib/interfaces/IReactive.sol";

contract BridgeLPTest is Test {
    BridgeSwapMain bridgeA;
    BridgeSwapMain bridgeB;
    SwapBridgeRSC rsc;
    MockToken tokenA;
    MockToken tokenB;

    address lp = address(0x10);
    address swapper = address(0x20);
    address service = address(0x999);
    uint256 constant CHAIN_A = 1;
    uint256 constant CHAIN_B = 2;

    event LiquidityProvided(address indexed lp, address indexed token, uint256 amount);
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

        bridgeA = new BridgeSwapMain(address(0));
        bridgeB = new BridgeSwapMain(address(0));

        rsc = new SwapBridgeRSC();
        rsc.setBridgeSwapMain(CHAIN_A, address(bridgeA));
        rsc.setBridgeSwapMain(CHAIN_B, address(bridgeB));

        // Setup LP on Chain B
        tokenB.mint(lp, 1000 ether);
        vm.startPrank(lp);
        tokenB.approve(address(bridgeB), 1000 ether);
        bridgeB.provideLiquidity(address(tokenB), 100 ether);
        vm.stopPrank();

        // Setup Swapper on Chain A
        tokenA.mint(swapper, 100 ether);
        vm.startPrank(swapper);
        tokenA.approve(address(bridgeA), 100 ether);
        vm.stopPrank();
    }

    function testLPDrivenFlow() public {
        // 1. Initial State Checks
        assertEq(bridgeB.totalLiquidity(address(tokenB)), 100 ether);
        assertEq(bridgeB.lpBalances(lp, address(tokenB)), 100 ether);

        // 2. Swapper initiates swap on Chain A
        vm.prank(swapper);
        vm.chainId(CHAIN_A);
        bytes32 orderId = bridgeA.initiateSwap(address(tokenA), 10 ether, address(tokenB), CHAIN_B);

        // Chain A pool should increase (Swapper's tokens locked here)
        assertEq(bridgeA.totalLiquidity(address(tokenA)), 10 ether);

        // 3. Simulate Reactive Network catching the event
        // topic_3 is targetChainId (indexed)
        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: CHAIN_A,
            _contract: address(bridgeA),
            topic_0: uint256(keccak256("BridgeSwapRequested(bytes32,address,uint256,address,address,uint256,uint256)")),
            topic_1: uint256(orderId),
            topic_2: uint256(uint160(swapper)),
            topic_3: CHAIN_B,
            data: abi.encode(address(tokenA), address(tokenB), 10 ether, block.timestamp),
            block_number: block.number,
            op_code: 0,
            block_hash: 0,
            tx_hash: 0,
            log_index: 0
        });

        rsc.react(log);

        // 4. Execute Payout on Chain B
        vm.chainId(CHAIN_B);
        bridgeB.executePayout(orderId, swapper, address(tokenB), 10 ether);

        // 5. Final State Checks
        assertEq(tokenB.balanceOf(swapper), 10 ether);
        assertEq(bridgeB.totalLiquidity(address(tokenB)), 90 ether);

        // 6. LP Withdraws remaining liquidity from Chain B
        vm.prank(lp);
        bridgeB.withdrawLiquidity(address(tokenB), 90 ether);
        assertEq(tokenB.balanceOf(lp), 990 ether);
        assertEq(bridgeB.lpBalances(lp, address(tokenB)), 10 ether);
    }
}
