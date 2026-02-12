// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        // Mint 1 million tokens to deployer
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
