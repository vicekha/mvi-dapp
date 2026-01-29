// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNFT is ERC721 {
    uint256 private _nextTokenId;

    constructor() ERC721("Mock NFT", "MNFT") {
        _nextTokenId = 1;
        // Mint some initial NFTs to the deployer
        _mint(msg.sender, _nextTokenId++);
        _mint(msg.sender, _nextTokenId++);
        _mint(msg.sender, _nextTokenId++);
    }

    function mint(address to) public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }
}
