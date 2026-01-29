// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AlphaDevs
 * @notice NFT collection for Alpha Devs on Lasna
 */
contract AlphaDevs is ERC721Enumerable, Ownable {
    uint256 private _tokenIdCounter;
    string private _baseTokenURI;
    
    constructor() ERC721("Alpha Devs", "ALPHADEV") {
        _baseTokenURI = "ipfs://alphadevs/";
    }
    
    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        _safeMint(to, tokenId);
        return tokenId;
    }
    
    function batchMint(address to, uint256 count) external onlyOwner {
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = _tokenIdCounter;
            _tokenIdCounter++;
            _safeMint(to, tokenId);
        }
    }
    
    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }
    
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
