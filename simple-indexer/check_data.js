const http = require('http');

const query = JSON.stringify({
    query: `
    query {
      orders(limit: 10, orderBy: "timestamp", orderDirection: "desc") {
        id
        maker
        tokenIn
        tokenOut
        amountIn
        amountOut
        status
        targetChainId
      }
    }
  `
});

const options = {
    hostname: 'localhost',
    port: 42069,
    path: '/graphql',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': query.length
    }
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            if (res.statusCode !== 200) {
                console.error(`Indexer returned status: ${res.statusCode}`);
                console.error('Body:', data);
                return;
            }

            const result = JSON.parse(data);
            console.log('Indexer Response:', JSON.stringify(result, null, 2));

            if (result.data && result.data.orders && result.data.orders.length > 0) {
                console.log(`Found ${result.data.orders.length} orders in indexer.`);
                result.data.orders.forEach(o => {
                    console.log(`Order ${o.id}: Maker=${o.maker}, Status=${o.status}, TargetChain=${o.targetChainId}, Timestamp=${o.timestamp}`);
                });
            } else {
                console.log('Indexer returned NO orders.');
            }
        } catch (e) {
            console.error('Error parsing response:', e.message);
            console.error('Raw response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('Error querying indexer:', error.message);
});

req.write(query);
req.end();
