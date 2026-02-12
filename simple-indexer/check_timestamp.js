const http = require('http');

const query = JSON.stringify({
    query: `
    query {
      orders(limit: 1, orderBy: "timestamp", orderDirection: "desc") {
        timestamp
        status
        id
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
            if (result.data && result.data.orders && result.data.orders.length > 0) {
                const o = result.data.orders[0];
                console.log(`LATEST_TIMESTAMP: ${o.timestamp}`);
                console.log(`LATEST_STATUS: ${o.status}`);
                console.log(`CURRENT_TIME: ${Math.floor(Date.now() / 1000)}`);
            } else {
                console.log('NO_ORDERS');
            }
        } catch (e) { console.error(e); }
    });
});

req.write(query);
req.end();
