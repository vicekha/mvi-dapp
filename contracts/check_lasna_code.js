const ethers = require('ethers');

// ABI for getting assetVerifier address
const abi = ["function assetVerifier() view returns (address)"];

const addresses = {
    WALLET_SWAP_MAIN: '0x74f793F9dA171F9aE8a4D2C8105379bF0227AC30',
    ORDER_PROCESSOR: '0x7EB1299099c2d781a28ac21f8D5cF0137E6C37AC',
    ASSET_VERIFIER: '0x3730b9A8d3de34049eE02013B0eE40E80a7f265b'
};

const rpcUrl = "https://lasna-rpc.rnk.dev/";

async function check() {
    console.log("Checking Lasna deployment...");
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 1. Check Code
    for (const [name, addr] of Object.entries(addresses)) {
        console.log(`Checking ${name} at ${addr}...`);
        const code = await provider.getCode(addr);
        if (code === '0x') {
            console.error(`❌ NO CODE at ${name}!`);
        } else {
            console.log(`✅ Code found (${code.length} bytes)`);
        }
    }

    // 2. Check Linkage
    console.log("Checking OrderProcessor linkage...");
    // Manually call assetVerifier() since we don't have full ABI setup
    // assetVerifier() selector: 0x56087596
    const avResult = await provider.call({
        to: addresses.ORDER_PROCESSOR,
        data: "0x56087596"
    });

    // Decode address (last 20 bytes)
    const storedAv = "0x" + avResult.slice(-40);
    console.log(`Stored AssetVerifier: ${storedAv}`);

    if (storedAv.toLowerCase() === addresses.ASSET_VERIFIER.toLowerCase()) {
        console.log("✅ AssetVerifier Linked Correctly");
    } else {
        console.error("❌ AssetVerifier Mismatched!");
    }
}

check().catch(console.error);
