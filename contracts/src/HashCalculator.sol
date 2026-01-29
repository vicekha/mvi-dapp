// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HashCalculator {
    function getHash() public pure returns (bytes32) {
        return keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)");
    }
}
