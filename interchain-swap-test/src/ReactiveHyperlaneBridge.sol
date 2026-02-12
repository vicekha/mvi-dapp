// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// Hyperlane Mailbox interface
interface IMailbox {
    function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        payable
        returns (bytes32 messageId);

    function quoteDispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        view
        returns (uint256 fee);
}

/**
 * @title ReactiveHyperlaneBridge
 * @dev Bridge contract for wallet-to-wallet token transfers using Hyperlane and Reactive Network
 * Reactive Network Compliant - Emits events for cross-chain synchronization
 */
contract ReactiveHyperlaneBridge is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Bridge transfer record
    struct BridgeTransfer {
        address token;
        uint256 amount;
        uint256 tokenId;
        bool isNft;
        address sender;
        address recipient;
        uint256 sourceChainId;
        uint256 targetChainId;
        uint256 timestamp;
        bool completed;
    }

    // Constants
    uint64 public constant GAS_LIMIT = 1000000;
    bytes32 public constant BRIDGE_TOPIC = 0x5d92f2a197d79e408c4c2a2676bafbdad24a6a1853539e3c6f3978228c6fcfb2;

    // Hyperlane configuration
    IMailbox public mailbox;

    // Chain mapping (chainId => hyperlaneDomain)
    mapping(uint256 => uint32) public chainToHyperlaneDomain;

    // Supported chains
    uint256[] public supportedChains;

    // Supported tokens
    mapping(address => bool) public supportedTokens;
    address[] public tokenList;

    // Bridge instances on other chains (chainId => bridgeAddress)
    mapping(uint256 => address) public remoteBridges;

    // Fee configuration
    uint256 public bridgeFeePercentage; // in basis points
    address public feeCollector;

    // Transfer tracking
    mapping(bytes32 => BridgeTransfer) public transfers;
    bytes32[] public transferIds;

    // WalletSwapMain contracts on each chain (chainId => walletSwapMain address)
    mapping(uint256 => address) public remoteSwapContracts;

    // Swap intent structure for cross-chain matching
    struct SwapIntent {
        bytes32 orderId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        address maker;
        uint256 sourceChainId;
        uint256 targetChainId;
        uint256 timestamp;
    }

    // Events - Reactive Network compliant
    event TokenBridgeInitiated(
        bytes32 indexed transferId,
        address indexed token,
        uint256 amount,
        address indexed sender,
        address recipient,
        uint256 targetChainId,
        uint256 timestamp
    );
    event TokenBridgeCompleted(
        bytes32 indexed transferId,
        address indexed token,
        uint256 amount,
        address indexed recipient,
        uint256 sourceChainId,
        uint256 timestamp
    );
    event BridgeFeeCollected(address indexed token, uint256 amount, address indexed collector, uint256 timestamp);
    event SupportedChainAdded(uint256 chainId, uint32 hyperlaneDomain);
    event SupportedChainRemoved(uint256 chainId);
    event SupportedTokenAdded(address indexed token, string name, string symbol);
    event SupportedTokenRemoved(address indexed token);
    event SwapIntentDispatched(bytes32 indexed orderId, bytes32 indexed messageId, uint256 targetChainId, address maker);
    event SwapIntentReceived(bytes32 indexed orderId, address maker, uint256 sourceChainId);
    event ReactiveHyperlaneBridgeInitialized(address indexed owner, address mailbox);

    constructor(address _mailbox, address _feeCollector, uint256 _bridgeFeePercentage) {
        require(_mailbox != address(0), "Invalid mailbox address");
        require(_feeCollector != address(0), "Invalid fee collector address");
        require(_bridgeFeePercentage <= 1000, "Fee percentage too high"); // Max 10%

        mailbox = IMailbox(_mailbox);
        feeCollector = _feeCollector;
        bridgeFeePercentage = _bridgeFeePercentage;

        emit ReactiveHyperlaneBridgeInitialized(msg.sender, _mailbox);
    }

    /**
     * @dev Bridge ERC20 token to another chain
     * @param token Token address
     * @param amount Amount to bridge
     * @param recipient Recipient address on target chain
     * @param targetChainId Target chain ID
     * @return transferId Transfer ID
     */
    function bridgeToken(address token, uint256 amount, address recipient, uint256 targetChainId)
        external
        nonReentrant
        returns (bytes32)
    {
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than 0");
        require(recipient != address(0), "Invalid recipient");
        require(chainToHyperlaneDomain[targetChainId] != 0, "Target chain not supported");

        // Calculate fee
        uint256 fee = (amount * bridgeFeePercentage) / 10000;
        uint256 amountAfterFee = amount - fee;

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Transfer fee to collector
        if (fee > 0) {
            IERC20(token).safeTransfer(feeCollector, fee);
            emit BridgeFeeCollected(token, fee, feeCollector, block.timestamp);
        }

        // Generate transfer ID
        // forge-lint: disable-next-line(asm-keccak256)
        bytes32 transferId =
            keccak256(abi.encodePacked(token, amount, msg.sender, recipient, block.timestamp, block.number));

        // Record transfer
        transfers[transferId] = BridgeTransfer({
            token: token,
            amount: amountAfterFee,
            tokenId: 0,
            isNft: false,
            sender: msg.sender,
            recipient: recipient,
            sourceChainId: block.chainid,
            targetChainId: targetChainId,
            timestamp: block.timestamp,
            completed: false
        });

        transferIds.push(transferId);

        // Prepare bridge message
        bytes memory message = abi.encode(token, amountAfterFee, 0, false, msg.sender, recipient);

        // Get Hyperlane domain for target chain
        uint32 destinationDomain = chainToHyperlaneDomain[targetChainId];

        // Get remote bridge address
        address remoteBridge = remoteBridges[targetChainId];
        require(remoteBridge != address(0), "Remote bridge not configured");

        // Convert address to bytes32
        bytes32 recipientAddress = bytes32(uint256(uint160(remoteBridge)));

        // Quote dispatch fee
        uint256 dispatchFee = mailbox.quoteDispatch(destinationDomain, recipientAddress, message);
        require(address(this).balance >= dispatchFee, "Insufficient ETH for dispatch fee");

        // Dispatch message via Hyperlane
        mailbox.dispatch{value: dispatchFee}(destinationDomain, recipientAddress, message);

        emit TokenBridgeInitiated(
            transferId, token, amountAfterFee, msg.sender, recipient, targetChainId, block.timestamp
        );

        return transferId;
    }

    /**
     * @dev Bridge NFT to another chain
     * @param nft NFT contract address
     * @param tokenId NFT token ID
     * @param recipient Recipient address on target chain
     * @param targetChainId Target chain ID
     * @return transferId Transfer ID
     */
    function bridgeNft(address nft, uint256 tokenId, address recipient, uint256 targetChainId)
        external
        nonReentrant
        returns (bytes32)
    {
        require(supportedTokens[nft], "NFT not supported");
        require(recipient != address(0), "Invalid recipient");
        require(chainToHyperlaneDomain[targetChainId] != 0, "Target chain not supported");

        // Transfer fee (fixed fee for NFTs in native token)
        uint256 fee = bridgeFeePercentage > 0 ? 0.01 ether : 0; // Example fixed fee for NFT
        // In production, use a more robust fee calculation

        // Transfer NFT from sender
        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);

        // Generate transfer ID
        // forge-lint: disable-next-line(asm-keccak256)
        bytes32 transferId =
            keccak256(abi.encodePacked(nft, tokenId, msg.sender, recipient, block.timestamp, block.number, "NFT"));

        // Record transfer
        transfers[transferId] = BridgeTransfer({
            token: nft,
            amount: 0,
            tokenId: tokenId,
            isNft: true,
            sender: msg.sender,
            recipient: recipient,
            sourceChainId: block.chainid,
            targetChainId: targetChainId,
            timestamp: block.timestamp,
            completed: false
        });

        transferIds.push(transferId);

        // Prepare bridge message
        bytes memory message = abi.encode(nft, 0, tokenId, true, msg.sender, recipient);

        // Get Hyperlane domain for target chain
        uint32 destinationDomain = chainToHyperlaneDomain[targetChainId];

        // Get remote bridge address
        address remoteBridge = remoteBridges[targetChainId];
        require(remoteBridge != address(0), "Remote bridge not configured");

        // Convert address to bytes32
        bytes32 recipientAddress = bytes32(uint256(uint160(remoteBridge)));

        // Quote dispatch fee
        uint256 dispatchFee = mailbox.quoteDispatch(destinationDomain, recipientAddress, message);
        require(address(this).balance >= dispatchFee, "Insufficient ETH for dispatch fee");

        // Dispatch message via Hyperlane
        mailbox.dispatch{value: dispatchFee}(destinationDomain, recipientAddress, message);

        emit TokenBridgeInitiated(transferId, nft, tokenId, msg.sender, recipient, targetChainId, block.timestamp);

        return transferId;
    }

    /**
     * @dev Dispatch a swap intent to another chain for cross-chain order matching
     * @param orderId Original order ID
     * @param tokenIn Token the maker is offering
     * @param tokenOut Token the maker wants
     * @param amountIn Amount the maker is offering
     * @param amountOut Amount the maker wants
     * @param maker Address of the maker
     * @param targetChainId Target chain ID
     * @return messageId Hyperlane message ID
     */
    function dispatchSwapIntent(
        bytes32 orderId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address maker,
        uint256 targetChainId
    ) external payable returns (bytes32 messageId) {
        require(chainToHyperlaneDomain[targetChainId] != 0, "Target chain not supported");
        
        // Get Hyperlane domain for target chain
        uint32 destinationDomain = chainToHyperlaneDomain[targetChainId];
        
        // Get remote bridge address
        address remoteBridge = remoteBridges[targetChainId];
        require(remoteBridge != address(0), "Remote bridge not configured");
        
        // Encode swap intent message (type 1 = swap intent, to distinguish from regular transfers)
        bytes memory message = abi.encode(
            uint8(1), // Message type: 1 = swap intent
            orderId,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            maker,
            block.chainid
        );
        
        // Convert address to bytes32
        bytes32 recipientAddress = bytes32(uint256(uint160(remoteBridge)));
        
        // Quote dispatch fee
        uint256 dispatchFee = mailbox.quoteDispatch(destinationDomain, recipientAddress, message);
        require(msg.value >= dispatchFee, "Insufficient ETH for dispatch fee");
        
        // Dispatch message via Hyperlane
        messageId = mailbox.dispatch{value: dispatchFee}(destinationDomain, recipientAddress, message);
        
        // Refund excess
        if (msg.value > dispatchFee) {
            (bool success,) = msg.sender.call{value: msg.value - dispatchFee}("");
            require(success, "Refund failed");
        }
        
        emit SwapIntentDispatched(orderId, messageId, targetChainId, maker);
        
        return messageId;
    }

    /**
     * @dev Set the WalletSwapMain contract address for a chain
     * @param chainId Chain ID
     * @param swapContract WalletSwapMain address on that chain
     */
    function setRemoteSwapContract(uint256 chainId, address swapContract) external onlyOwner {
        require(swapContract != address(0), "Invalid swap contract");
        remoteSwapContracts[chainId] = swapContract;
    }

    /**
     * @dev Handle incoming bridge message from Hyperlane
     * @param sourceChain Source chain domain
     * @param sender Sender address (as bytes32)
     * @param message Encoded bridge data
     */
    function handle(uint32 sourceChain, bytes32 sender, bytes calldata message) external payable {
        require(msg.sender == address(mailbox), "Only mailbox can call handle");

        // Verify sender is a known remote bridge
        address senderAddress = address(uint160(uint256(sender)));
        bool validSender = false;

        for (uint256 i = 0; i < supportedChains.length; i++) {
            uint256 chainId = supportedChains[i];
            if (remoteBridges[chainId] == senderAddress) {
                validSender = true;
                break;
            }
        }

        require(validSender, "Unknown sender bridge");

        // Find source chain ID from domain
        uint256 sourceChainId = 0;
        for (uint256 i = 0; i < supportedChains.length; i++) {
            uint256 chainId = supportedChains[i];
            if (chainToHyperlaneDomain[chainId] == sourceChain) {
                sourceChainId = chainId;
                break;
            }
        }

        // Check message type (first byte determines routing)
        // Type 0 or regular: Token/NFT transfer
        // Type 1: Swap intent
        uint8 messageType = abi.decode(message[:32], (uint8));
        
        if (messageType == 1) {
            // Swap intent message - route to WalletSwapMain
            (
                ,  // skip messageType
                bytes32 orderId,
                address tokenIn,
                address tokenOut,
                uint256 amountIn,
                uint256 amountOut,
                address maker,
                uint256 intentSourceChainId
            ) = abi.decode(message, (uint8, bytes32, address, address, uint256, uint256, address, uint256));
            
            emit SwapIntentReceived(orderId, maker, intentSourceChainId);
            
            // Forward to local WalletSwapMain if configured
            address localSwapContract = remoteSwapContracts[block.chainid];
            if (localSwapContract != address(0)) {
                // Call WalletSwapMain.handleCrossChainIntent
                (bool success,) = localSwapContract.call(
                    abi.encodeWithSignature(
                        "handleCrossChainIntent(bytes32,address,address,uint256,uint256,address,uint256)",
                        orderId, tokenIn, tokenOut, amountIn, amountOut, maker, intentSourceChainId
                    )
                );
                // We don't revert on failure - just log the intent
                if (!success) {
                    // Intent logged but not matched
                }
            }
        } else {
            // Token/NFT transfer message (legacy format)
            (address asset, uint256 amount, uint256 tokenId, bool isNft, address originalSender, address recipient) =
                abi.decode(message, (address, uint256, uint256, bool, address, address));

            require(supportedTokens[asset], "Asset not supported");
            require(recipient != address(0), "Invalid recipient");

            // Transfer asset to recipient
            if (isNft) {
                IERC721(asset).safeTransferFrom(address(this), recipient, tokenId);
            } else {
                require(amount > 0, "Amount must be greater than 0");
                IERC20(asset).safeTransfer(recipient, amount);
            }

            // Generate transfer ID
            // forge-lint: disable-next-line(asm-keccak256)
            bytes32 transferId = keccak256(
                abi.encodePacked(
                    asset,
                    isNft ? tokenId : amount,
                    originalSender,
                    recipient,
                    block.timestamp,
                    block.number,
                    isNft ? "NFT" : "Token"
                )
            );

            emit TokenBridgeCompleted(
                transferId, asset, isNft ? tokenId : amount, recipient, sourceChainId, block.timestamp
            );
        }
    }

    /**
     * @dev Add supported chain
     * @param chainId Chain ID
     * @param hyperlaneDomain Hyperlane domain ID
     * @param remoteBridge Remote bridge address
     */
    function addSupportedChain(uint256 chainId, uint32 hyperlaneDomain, address remoteBridge) external onlyOwner {
        require(chainId != 0, "Invalid chain ID");
        require(hyperlaneDomain != 0, "Invalid Hyperlane domain");
        require(remoteBridge != address(0), "Invalid remote bridge address");
        require(chainToHyperlaneDomain[chainId] == 0, "Chain already supported");

        chainToHyperlaneDomain[chainId] = hyperlaneDomain;
        remoteBridges[chainId] = remoteBridge;
        supportedChains.push(chainId);

        emit SupportedChainAdded(chainId, hyperlaneDomain);
    }

    /**
     * @dev Remove supported chain
     * @param chainId Chain ID
     */
    function removeSupportedChain(uint256 chainId) external onlyOwner {
        require(chainToHyperlaneDomain[chainId] != 0, "Chain not supported");

        delete chainToHyperlaneDomain[chainId];
        delete remoteBridges[chainId];

        // Remove from supportedChains array
        for (uint256 i = 0; i < supportedChains.length; i++) {
            if (supportedChains[i] == chainId) {
                supportedChains[i] = supportedChains[supportedChains.length - 1];
                supportedChains.pop();
                break;
            }
        }

        emit SupportedChainRemoved(chainId);
    }

    /**
     * @dev Add supported token
     * @param token Token address
     * @param name Token name
     * @param symbol Token symbol
     */
    function addSupportedToken(address token, string calldata name, string calldata symbol) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(!supportedTokens[token], "Token already supported");

        supportedTokens[token] = true;
        tokenList.push(token);

        emit SupportedTokenAdded(token, name, symbol);
    }

    /**
     * @dev Remove supported token
     * @param token Token address
     */
    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "Token not supported");

        supportedTokens[token] = false;

        // Remove from tokenList
        for (uint256 i = 0; i < tokenList.length; i++) {
            if (tokenList[i] == token) {
                tokenList[i] = tokenList[tokenList.length - 1];
                tokenList.pop();
                break;
            }
        }

        emit SupportedTokenRemoved(token);
    }

    /**
     * @dev Get supported chains
     * @return Array of supported chain IDs
     */
    function getSupportedChains() external view returns (uint256[] memory) {
        return supportedChains;
    }

    /**
     * @dev Get token list
     * @return Array of supported token addresses
     */
    function getTokenList() external view returns (address[] memory) {
        return tokenList;
    }

    /**
     * @dev Get transfer details
     * @param transferId Transfer ID
     * @return Transfer record
     */
    function getTransfer(bytes32 transferId) external view returns (BridgeTransfer memory) {
        return transfers[transferId];
    }

    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}
