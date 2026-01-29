// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EulerLagrangeOrderProcessor} from "./EulerLagrangeOrderProcessor.sol";

contract InternalFeeConverter is Ownable {
    using SafeERC20 for IERC20;

    EulerLagrangeOrderProcessor public orderProcessor;

    event ConversationOrderCreated(bytes32 indexed orderId, address indexed tokenIn, uint256 amountIn);

    constructor() {}

    function setOrderProcessor(address _orderProcessor) external onlyOwner {
        orderProcessor = EulerLagrangeOrderProcessor(_orderProcessor);
    }

    function createConversionOrder(address tokenIn, uint256 amountIn) external returns (bytes32) {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).safeIncreaseAllowance(address(orderProcessor), amountIn);

        // Stub implementation until OrderProcessor upgrade allows fee mechanics for system contracts
        return bytes32(0);
    }

    receive() external payable {}
}
