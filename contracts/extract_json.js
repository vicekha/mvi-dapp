const fs = require('fs');
try {
    const data = fs.readFileSync('broadcast/DeployReactiveCallbackV5.s.sol/5318007/run-latest.json', 'utf8');
    const json = JSON.parse(data);
    // Usually transactions array or receipts
    // Look for contractAddress in receipts
    // Traverse logic if structure varies
    if (json.receipts && json.receipts.length > 0) {
        console.log("ADDR:", json.receipts[0].contractAddress);
    } else if (json.transactions && json.transactions.length > 0) {
        console.log("ADDR:", json.transactions[0].contractAddress);
    }
} catch (e) {
    console.error(e);
}
