const http = require('http');

const query = JSON.stringify({
    query: `
    query {
      orders(limit: 5, orderBy: "timestamp", orderDirection: "desc") {
        id
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
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const result = JSON.parse(data);
            if (result.data && result.data.orders) {
                result.data.orders.forEach(o => {
                    console.log(`ID: ${o.id.slice(0, 10)}... | CHAIN: ${o.targetChainId}`);
                });
            }
        } catch (e) { console.error(e); }
    });
});

req.write(query);
req.end();
