// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {InternalFeeConverter} from "./InternalFeeConverter.sol";
import {FeeSwapper} from "./FeeSwapper.sol";

contract HybridFeeConverter is Ownable {
    using SafeERC20 for IERC20;

    InternalFeeConverter public internalConverter;
    FeeSwapper public feeSwapper;

    event ConvertedInternal(address indexed token, uint256 amount);
    event ConvertedExternal(address indexed token, uint256 amount);
    event ConversionFailed(address indexed token, uint256 amount);

    constructor(address _internalConverter, address _feeSwapper) {
        internalConverter = InternalFeeConverter(payable(_internalConverter));
        feeSwapper = FeeSwapper(payable(_feeSwapper));
    }

    function convertFee(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Strategy: Try External (Mock/Uniswap) first for simplicity in testing?
        // Or Internal?
        // Let's try External first since Internal is stubbed.

        bool success = false;

        // 1. External (Uniswap)
        if (address(feeSwapper) != address(0)) {
            IERC20(token).safeIncreaseAllowance(address(feeSwapper), amount);
            try feeSwapper.swapTokenForNative(token, amount) returns (uint256 out) {
                if (out > 0) {
                    success = true;
                    emit ConvertedExternal(token, amount);
                }
            } catch {}
        }

        // 2. Internal (Fallback)
        if (!success) {
            IERC20(token).safeIncreaseAllowance(address(internalConverter), amount);
            try internalConverter.createConversionOrder(token, amount) returns (bytes32 id) {
                if (id != bytes32(0)) {
                    success = true;
                    emit ConvertedInternal(token, amount);
                }
            } catch {}
        }

        if (!success) {
            emit ConversionFailed(token, amount);
            // Return token? Or keep for later?
            // Keep for retry.
        }
    }

    receive() external payable {
        // Forward received ETH to owner (FeeDistributor)
        // Or whoever called convert?
        // Actually, FeeDistributor calls convert.
        // So we should send ETH to FeeDistributor (msg.sender if we assume call flow).
        // BUT FeeDistributorV4 calls convert.
        // We should send ETH back to it.
        (bool sent,) = owner().call{value: msg.value}("");
        require(sent, "Failed to forward ETH");
    }
}
