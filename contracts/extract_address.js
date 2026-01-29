const fs = require('fs');

try {
    // Try reading as utf16le first given previous tool errors
    let content = fs.readFileSync('deploy_bi_rsc_v4_log.txt', 'utf16le');
    let match = content.match(/ReactiveCallback Deployed at: (0x[a-fA-F0-9]{40})/);

    if (!match) {
        // Fallback to utf8 if utf16le fails or looks wrong
        content = fs.readFileSync('deploy_bi_rsc_v4_log.txt', 'utf8');
        match = content.match(/ReactiveCallback Deployed at: (0x[a-fA-F0-9]{40})/);
    }

    if (match) {
        console.log("EXTRACTED_ADDRESS:" + match[1]);
    } else {
        console.log("ADDRESS_NOT_FOUND");
        // Print context to debug
        const index = content.indexOf('ReactiveCallback Deployed at:');
        if (index !== -1) {
            console.log("CONTEXT:" + content.substring(index, index + 100));
        }
    }
} catch (e) {
    console.error("Error:", e);
}
