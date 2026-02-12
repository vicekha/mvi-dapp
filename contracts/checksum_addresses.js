const { ethers } = require('ethers');

const addresses = [
    // Lasna
    '0xbdad6a18619a9df01b762ba826805b1241a688d8', // WALLET_SWAP_MAIN
    '0x5aa236d9a3f4f3ce095cc0580a09d0e339f8073d', // ORDER_PROCESSOR
    '0x44b1ddd213b8f31673803a556ed6fd9d7044125b', // FEE_DISTRIBUTOR
    '0x08a3830525461795f66416085ddc03c986f37d9b', // ASSET_VERIFIER
    '0xe3023c0305fedee834a7a553dee3bd14042819698', // FEE-SWAPPER
    '0xf2f49d7bdf026ce5d8fc4197f86640fd1adb2545', // MOCK-NFT
    '0x55ed2321aad341929efa1059017c287fd1272b44', // RSC V9

    // Sepolia
    '0x9c987b2bfd12dddf97fc6af7e6ffb26eaf9586c7', // WALLET_SWAP_MAIN
    '0x64cd052e36c6d44ea8c648876bea489c5c2a927d', // ORDER_PROCESSOR
    '0xca1e40a5b0b12d57cdcc252916139aae1bbbe9cb', // FEE_DISTRIBUTOR
    '0x79819386b8fc15781ed3f417837b68f8da26223e', // ASSET_VERIFIER
    '0x256a19ffa31bfde2e053443fe96def88481bae14', // RSC V7? or something
];

console.log('--- Checksummed Addresses ---');
addresses.forEach(addr => {
    try {
        console.log(`${addr} -> ${ethers.getAddress(addr)}`);
    } catch (e) {
        console.log(`${addr} -> INVALID`);
    }
});
