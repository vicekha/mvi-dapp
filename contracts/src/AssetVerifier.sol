// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AssetVerifier
 * @dev Verifies token and NFT ownership for orders
 * Reactive Network Compliant - Emits events for verification tracking
 */
contract AssetVerifier is Ownable {
    // Verification record
    struct Verification {
        address token;
        address owner;
        uint256 amount;
        uint256 tokenId;
        bool isNft;
        uint256 timestamp;
        bool active;
        address creator; // M-6: Track who created the verification
    }

    // Verification mapping
    mapping(bytes32 => Verification) public verifications;

    // Active verifications tracking
    bytes32[] public activeVerificationIds;
    mapping(bytes32 => uint256) public verificationIndex;

    // M-6: Authorized contracts that can end verifications
    mapping(address => bool) public authorizedCallers;

    // Events - Reactive Network compliant
    event VerificationStarted(
        bytes32 indexed verificationId, address indexed token, address indexed owner, uint256 amount, bool isNft
    );
    event VerificationEnded(bytes32 indexed verificationId, bool success);
    event AssetMoved(bytes32 indexed verificationId, address indexed token, address indexed from, address to);
    event AssetVerifierInitialized(address indexed owner);
    event AuthorizedCallerSet(address indexed caller, bool authorized);

    constructor() {
        emit AssetVerifierInitialized(msg.sender);
    }

    /**
     * @dev Set authorized caller status
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether the caller is authorized
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerSet(caller, authorized);
    }

    /**
     * @dev Start verification for token
     * @param token Token address
     * @param owner Token owner
     * @param amount Amount to verify
     * @return verificationId Verification ID
     */
    function verifyToken(address token, address owner, uint256 amount) external returns (bytes32) {
        require(owner != address(0), "Invalid owner");
        require(amount > 0, "Invalid amount");

        // Check current balance - handle native ETH (address(0))
        uint256 balance;
        if (token == address(0)) {
            balance = owner.balance;
        } else {
            balance = IERC20(token).balanceOf(owner);
        }
        require(balance >= amount, "Insufficient balance");

        // forge-lint: disable-next-line(asm-keccak256)
        bytes32 verificationId = keccak256(abi.encodePacked(token, owner, amount, block.timestamp, block.number));

        verifications[verificationId] = Verification({
            token: token,
            owner: owner,
            amount: amount,
            tokenId: 0,
            isNft: false,
            timestamp: block.timestamp,
            active: true,
            creator: msg.sender
        });

        // Add to active verifications
        verificationIndex[verificationId] = activeVerificationIds.length;
        activeVerificationIds.push(verificationId);

        emit VerificationStarted(verificationId, token, owner, amount, false);

        return verificationId;
    }

    /**
     * @dev Start verification for NFT
     * @param token NFT contract address
     * @param owner NFT owner
     * @param tokenId NFT token ID
     * @return verificationId Verification ID
     */
    function verifyNft(address token, address owner, uint256 tokenId) external returns (bytes32) {
        require(token != address(0), "Invalid token");
        require(owner != address(0), "Invalid owner");

        // Check current ownership
        try IERC721(token).ownerOf(tokenId) returns (address currentOwner) {
            require(currentOwner == owner, "Not the owner");
        } catch {
            revert("NFT ownership check failed");
        }

        // forge-lint: disable-next-line(asm-keccak256)
        bytes32 verificationId = keccak256(abi.encodePacked(token, owner, tokenId, block.timestamp, block.number));

        verifications[verificationId] = Verification({
            token: token,
            owner: owner,
            amount: 0,
            tokenId: tokenId,
            isNft: true,
            timestamp: block.timestamp,
            active: true,
            creator: msg.sender
        });

        // Add to active verifications
        verificationIndex[verificationId] = activeVerificationIds.length;
        activeVerificationIds.push(verificationId);

        emit VerificationStarted(verificationId, token, owner, 0, true);

        return verificationId;
    }

    /**
     * @dev Check if verification is still valid
     * @param verificationId Verification ID
     * @return Valid status
     */
    function checkVerification(bytes32 verificationId) external view returns (bool) {
        Verification storage verification = verifications[verificationId];
        if (!verification.active) return false;

        if (verification.isNft) {
            try IERC721(verification.token).ownerOf(verification.tokenId) returns (address currentOwner) {
                return currentOwner == verification.owner;
            } catch {
                return false;
            }
        } else {
            uint256 balance;
            if (verification.token == address(0)) {
                balance = verification.owner.balance;
            } else {
                try IERC20(verification.token).balanceOf(verification.owner) returns (uint256 b) {
                    balance = b;
                } catch {
                    return false;
                }
            }
            return balance >= verification.amount;
        }
    }

    /**
     * @dev End verification — M-6: restricted to verification creator, authorized callers, or owner
     * @param verificationId Verification ID
     */
    function endVerification(bytes32 verificationId) external {
        Verification storage verification = verifications[verificationId];
        require(verification.active, "Verification not active");
        // M-6: Access control
        require(
            msg.sender == verification.creator ||
            msg.sender == verification.owner ||
            msg.sender == owner() ||
            authorizedCallers[msg.sender],
            "Unauthorized: not creator, owner, or authorized caller"
        );

        verification.active = false;

        // Remove from active verifications
        uint256 index = verificationIndex[verificationId];
        if (index < activeVerificationIds.length) {
            bytes32 lastId = activeVerificationIds[activeVerificationIds.length - 1];
            activeVerificationIds[index] = lastId;
            verificationIndex[lastId] = index;
        }
        activeVerificationIds.pop();

        emit VerificationEnded(verificationId, true);
    }

    /**
     * @dev Get all active verifications
     * @return Array of active verification IDs
     */
    function getActiveVerifications() external view returns (bytes32[] memory) {
        return activeVerificationIds;
    }

    /**
     * @dev Get active verification count
     * @return Number of active verifications
     */
    function getActiveVerificationCount() external view returns (uint256) {
        return activeVerificationIds.length;
    }

    /**
     * @dev Get verification details
     * @param verificationId Verification ID
     * @return Verification record
     */
    function getVerification(bytes32 verificationId) external view returns (Verification memory) {
        return verifications[verificationId];
    }
}
