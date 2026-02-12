// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TrustWalletFeeDistributor} from "./TrustWalletFeeDistributor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HybridFeeConverter} from "./HybridFeeConverter.sol";

contract TrustWalletFeeDistributorV4 is TrustWalletFeeDistributor {
    using SafeERC20 for IERC20;

    HybridFeeConverter public converter;

    uint256 public constant CONVERSION_THRESHOLD = 0.01 ether;

    constructor(address _trustWallet, address _converter) TrustWalletFeeDistributor(_trustWallet) {
        converter = HybridFeeConverter(payable(_converter));
    }

    // Override with EXACT signature of Base
    function distributeFee(
        address token,
        AssetType assetType,
        uint256 amount,
        uint256 minutesValuation,
        address sender,
        bytes32 orderId
    ) external payable override returns (uint256) {
        // Calculate fee
        uint256 fee = calculateFee(token, assetType, amount, minutesValuation);
        if (fee == 0) return 0;

        // ETH Fee
        if (token == address(0)) {
            require(msg.value >= fee, "Insufficient fee");
            accumulatedFees[address(0)] += fee;
        }
        // ERC20 Fee
        else if (assetType == AssetType.ERC20) {
            // Transfer fee from payer (sender) to THIS contract
            IERC20(token).safeTransferFrom(sender, address(this), fee);

            // Auto-Convert
            _attemptConversion(token, fee);
        }
        // NFT Fee (Paid in Native)
        else if (assetType == AssetType.ERC721) {
            require(msg.value >= fee, "Insufficient fee for NFT");
            accumulatedFees[address(0)] += fee;
        }

        emit FeeDistributed(token, address(this), fee, orderId, block.timestamp);
        return fee;
    }

    function _attemptConversion(address token, uint256 amount) internal {
        IERC20(token).safeIncreaseAllowance(address(converter), amount);
        try converter.convertFee(token, amount) {
        // Success
        }
        catch {
            accumulatedFees[token] += amount;
        }
    }

    receive() external payable override {
        accumulatedFees[address(0)] += msg.value;
    }
}
