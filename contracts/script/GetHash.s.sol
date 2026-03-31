// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

contract GetHash is Script {
    function run() external {
        bytes32 hash = keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint256)");
        console.log("HASH_START");
        console.logBytes32(hash);
        console.log("HASH_END");
    }
}
