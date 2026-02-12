const fs = require('fs');
try {
    let content = fs.readFileSync('deploy_bi_rsc_v4_log.txt', 'utf16le');
    let match = content.match(/ReactiveCallback Deployed at: (0x[a-fA-F0-9]{40})/);
    if (!match) {
        content = fs.readFileSync('deploy_bi_rsc_v4_log.txt', 'utf8');
        match = content.match(/ReactiveCallback Deployed at: (0x[a-fA-F0-9]{40})/);
    }
    if (match) {
        fs.writeFileSync('v4_addr.txt', match[1]);
    }
} catch (e) { }
