// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

contract HashTest is Test {
    function testGetHash() public {
        bytes32 h = keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)");
        console.log("HASH:");
        console.logBytes32(h);
    }
}
