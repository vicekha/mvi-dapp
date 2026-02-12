
try {
    const logs = require('./logs_utf8.json');
    logs.forEach((log, index) => {
        if (log.topics[0] && log.topics[0].startsWith('0xff3b90bd')) {
            console.log(`Log ${index} (OrderCreated):`);
            const makerTopic = log.topics[2];
            const makerAddress = '0x' + makerTopic.slice(-40);
            console.log(`  Maker Address: ${makerAddress}`);
        }
    });
} catch (e) {
    console.error(e);
}
