const https = require('https');

const rpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";

const user = "0xB133a194893434107925682789F16662FB9DB062";
const walletSwapAddress = "0xbd6e6ab5a4e51a02316e5a27b6cebf26594843a0";
const tokenAddress = "0x0384754fe5780cacafcfad6ebd383ae98e496e48";
const expectedFeeDistributor = "0xa9b26a40d13568882350c9ed1b8b99e54515466e";

// Helpers
function pad(addr) {
    return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function rpc(method, params) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: method,
            params: params
        });

        const req = https.request(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log("Checking Allowance...");
    // allowance(owner, spender) -> 0xdd62ed3e
    const allowanceData = "0xdd62ed3e" + pad(user) + pad(walletSwapAddress);

    try {
        const res1 = await rpc("eth_call", [{
            to: tokenAddress,
            data: allowanceData
        }, "latest"]);

        const allowance = BigInt(res1.result || "0x0");
        console.log(`ALLOWANCE: ${allowance.toString()}`);

        const decimalsSelector = "0x313ce567"; // decimals()
        const resDec = await rpc("eth_call", [{ to: tokenAddress, data: decimalsSelector }, "latest"]);
        const decimals = BigInt(resDec.result || "0x0");
        console.log(`DECIMALS: ${decimals.toString()}`);

        // feeDistributor() -> 0xb7548c0f (keccak256("feeDistributor()")[0:4])
        const feeDistSelector = "0xb7548c0f";
        const res2 = await rpc("eth_call", [{ to: walletSwapAddress, data: feeDistSelector }, "latest"]);

        const feeDistAddr = "0x" + (res2.result || "").slice(-40);
        console.log(`FD_ONCHAIN: ${feeDistAddr}`);
        console.log(`FD_EXPECTED: ${expectedFeeDistributor}`);
        console.log(`MATCH: ${feeDistAddr.toLowerCase() === expectedFeeDistributor.toLowerCase()}`);

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
