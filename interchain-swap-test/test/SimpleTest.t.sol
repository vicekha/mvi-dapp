// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SwapMatcherRSC.sol";
import "../lib/reactive-lib/src/interfaces/IReactive.sol";

contract SimpleTest is Test {
    SwapMatcherRSC rsc;

    function setUp() public {
        // Deploy RSC with mocks
        rsc = new SwapMatcherRSC(address(0x1), 1, 1, address(0x2), address(0x2));
    }
    
    function testCompile() public {
        assertTrue(address(rsc) != address(0));
    }
}
