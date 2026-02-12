const http = require('http');

const query = JSON.stringify({
    query: `
    query {
      orders(limit: 10, orderBy: "timestamp", orderDirection: "desc") {
        id
        maker
        status
        targetChainId
        timestamp
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
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const result = JSON.parse(data);
            if (result.data && result.data.orders) {
                console.log(`Found ${result.data.orders.length} orders.`);
                result.data.orders.forEach(o => {
                    console.log(`MAKER: ${o.maker} | CHAIN: ${o.targetChainId} | STATUS: ${o.status}`);
                });
            }
        } catch (e) { console.error(e); }
    });
});

req.write(query);
req.end();
