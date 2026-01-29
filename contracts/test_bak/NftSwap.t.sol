// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {VirtualLiquidityPool} from "../src/VirtualLiquidityPool.sol";
import {EulerLagrangeOrderProcessor} from "../src/EulerLagrangeOrderProcessor.sol";
import {TrustWalletFeeDistributor} from "../src/TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "../src/AssetVerifier.sol";
import {WalletSwapMain} from "../src/WalletSwapMain.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MTK") {
        _mint(msg.sender, 1000 * 10 ** 18);
    }
}

contract MockERC721 is ERC721 {
    constructor() ERC721("Mock NFT", "MNFT") {
        _mint(msg.sender, 1);
        _mint(msg.sender, 2);
        _mint(msg.sender, 3);
    }
}

contract NftSwapTest is Test {
    VirtualLiquidityPool liquidityPool;
    EulerLagrangeOrderProcessor orderProcessor;
    TrustWalletFeeDistributor feeDistributor;
    AssetVerifier assetVerifier;
    WalletSwapMain walletSwapMain;

    MockERC20 token;
    MockERC721 nft;

    address owner = address(0x1);
    address trustWallet = address(0x2);
    address user1 = address(0x3);
    address user2 = address(0x4);

    function setUp() public {
        vm.startPrank(owner);

        liquidityPool = new VirtualLiquidityPool();
        feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        assetVerifier = new AssetVerifier();

        orderProcessor =
            new EulerLagrangeOrderProcessor(address(liquidityPool), address(feeDistributor), address(assetVerifier));

        walletSwapMain = new WalletSwapMain(
            address(liquidityPool), address(orderProcessor), address(feeDistributor), address(assetVerifier)
        );

        token = new MockERC20();
        nft = new MockERC721();

        // Whitelist tokens
        orderProcessor.whitelistToken(address(token));
        orderProcessor.whitelistToken(address(nft));

        vm.stopPrank();

        // Give some tokens and ETH to user1
        vm.startPrank(owner);
        token.transfer(user1, 100 * 10 ** 18);
        nft.transferFrom(owner, user1, 1);
        vm.deal(user1, 10 ether);
        vm.stopPrank();
    }

    function testTokenToNftSwapOrderCreation() public {
        vm.startPrank(user1);

        uint256 amountIn = 50 * 10 ** 18; // 50 tokens
        uint256 amountOut = 2; // NFT ID 2
        uint256 minutesValIn = 50 * 10 ** 18;
        uint256 minutesValOut = 100 * 10 ** 18;

        token.approve(address(walletSwapMain), amountIn);

        // Fee calculation should work
        uint256 fee = feeDistributor.calculateFee(
            address(token), TrustWalletFeeDistributor.AssetType.ERC20, amountIn, minutesValIn
        );

        // Approve fee pull from distributor if it pulls tokens
        token.approve(address(feeDistributor), fee);

        bytes32 orderId = walletSwapMain.createOrder{value: 0}(
            address(token),
            address(nft),
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC721,
            amountIn,
            amountOut,
            minutesValIn,
            minutesValOut,
            100, // slippage
            3600, // duration
            true,
            0 // target chain
        );

        assertNotEq(orderId, bytes32(0));

        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint256(order.typeIn), uint256(EulerLagrangeOrderProcessor.AssetType.ERC20));
        assertEq(uint256(order.typeOut), uint256(EulerLagrangeOrderProcessor.AssetType.ERC721));

        vm.stopPrank();
    }

    function testNftToTokenSwapOrderCreation() public {
        vm.startPrank(user1);

        uint256 tokenId = 1;
        uint256 amountOut = 100 * 10 ** 18;
        uint256 minutesValIn = 100 * 10 ** 18;
        uint256 minutesValOut = 100 * 10 ** 18;

        nft.approve(address(assetVerifier), tokenId); // Verifier needs approval to check? Wait, verifier only checks
        // ownerOf.
        // But WalletSwapMain or Processor might need it later?
        // Actually, order processor calls assetVerifier.verifyNft which checks ownerOf.

        // Calculate fee (NFT fee is in native tokens)
        uint256 fee = feeDistributor.calculateFee(
            address(nft), TrustWalletFeeDistributor.AssetType.ERC721, tokenId, minutesValIn
        );

        bytes32 orderId = walletSwapMain.createOrder{value: fee}(
            address(nft),
            address(token),
            WalletSwapMain.AssetType.ERC721,
            WalletSwapMain.AssetType.ERC20,
            tokenId,
            amountOut,
            minutesValIn,
            minutesValOut,
            100,
            3600,
            true,
            0
        );

        assertNotEq(orderId, bytes32(0));

        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint256(order.typeIn), uint256(EulerLagrangeOrderProcessor.AssetType.ERC721));
        assertEq(uint256(order.typeOut), uint256(EulerLagrangeOrderProcessor.AssetType.ERC20));

        vm.stopPrank();
    }

    function testNftToNftSwapOrderCreation() public {
        vm.startPrank(user1);

        uint256 tokenIdIn = 1;
        uint256 tokenIdOut = 2;
        uint256 minutesValIn = 100 * 10 ** 18;
        uint256 minutesValOut = 100 * 10 ** 18;

        uint256 fee = feeDistributor.calculateFee(
            address(nft), TrustWalletFeeDistributor.AssetType.ERC721, tokenIdIn, minutesValIn
        );

        bytes32 orderId = walletSwapMain.createOrder{value: fee}(
            address(nft),
            address(nft),
            WalletSwapMain.AssetType.ERC721,
            WalletSwapMain.AssetType.ERC721,
            tokenIdIn,
            tokenIdOut,
            minutesValIn,
            minutesValOut,
            100,
            3600,
            true,
            0
        );

        assertNotEq(orderId, bytes32(0));
        vm.stopPrank();
    }

    function testNftCallbackExecution() public {
        vm.startPrank(user1);

        uint256 tokenIdIn = 1;
        uint256 tokenIdOut = 3; // NFT to be received
        uint256 minutesValIn = 100 * 10 ** 18;
        uint256 minutesValOut = 100 * 10 ** 18;
        uint256 targetChainId = 137; // Polygon

        uint256 fee = feeDistributor.calculateFee(
            address(nft), TrustWalletFeeDistributor.AssetType.ERC721, tokenIdIn, minutesValIn
        );

        // Create cross-chain order
        bytes32 orderId = walletSwapMain.createOrder{value: fee}(
            address(nft),
            address(nft),
            WalletSwapMain.AssetType.ERC721,
            WalletSwapMain.AssetType.ERC721,
            tokenIdIn,
            tokenIdOut,
            minutesValIn,
            minutesValOut,
            100,
            3600,
            true,
            targetChainId
        );

        // Calculate callback ID (matches logic in WalletSwapMain)
        bytes32 callbackId = keccak256(abi.encodePacked(orderId, block.timestamp, block.number));

        vm.stopPrank();

        // Simulate WalletSwapMain receiving the NFT from source or having it
        vm.prank(owner);
        nft.transferFrom(owner, address(walletSwapMain), tokenIdOut);

        // Execute callback
        vm.prank(address(0xdeadbeef)); // Anyone can call it if they have the ID
        walletSwapMain.executeCallback(address(0xdeadbeef), address(0), callbackId);

        // Verify user1 received the NFT
        assertEq(nft.ownerOf(tokenIdOut), user1);
    }

    function testTokenToNftFulfillment() public {
        // 1. Setup Maker (user1) - Gives Token, Wants NFT
        vm.startPrank(user1);
        uint256 amountIn = 50 * 10 ** 18;
        uint256 nftIdOut = 2; // What maker wants

        token.approve(address(walletSwapMain), amountIn);

        // Fee collection requires allowance for the distributor
        uint256 fee =
            feeDistributor.calculateFee(address(token), TrustWalletFeeDistributor.AssetType.ERC20, amountIn, amountIn);
        token.approve(address(feeDistributor), fee);

        bytes32 orderId = walletSwapMain.createOrder{value: 0}(
            address(token),
            address(nft),
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC721,
            amountIn,
            nftIdOut,
            amountIn,
            100 * 10 ** 18,
            100,
            3600,
            false,
            0
        );
        vm.stopPrank();

        // 2. Setup Taker (user2) - Gives NFT, Wants Token
        vm.startPrank(owner);
        nft.transferFrom(owner, user2, nftIdOut); // Give NFT to user2
        vm.stopPrank();

        vm.startPrank(user2);
        nft.approve(address(walletSwapMain), nftIdOut);

        // Fulfill order
        walletSwapMain.fulfillOrder(orderId);

        // Verify results
        assertEq(nft.ownerOf(nftIdOut), user1, "Maker should have received NFT");
        assertEq(token.balanceOf(user2), amountIn, "Taker should have received Token");

        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint256(order.status), uint256(EulerLagrangeOrderProcessor.OrderStatus.FILLED));

        vm.stopPrank();
    }
}
