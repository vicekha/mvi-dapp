const http = require('http');

const query = JSON.stringify({
    query: `
    query {
      orders(limit: 100, orderBy: "timestamp", orderDirection: "desc") {
        id
        status
        timestamp
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
                const orders = result.data.orders;
                console.log(`Total Orders Indexed: ${orders.length}`);

                const counts = {};
                orders.forEach(o => {
                    counts[o.status] = (counts[o.status] || 0) + 1;
                });
                console.log('Counts by Status:', JSON.stringify(counts));

                if (orders.length > 0) {
                    const latest = orders[0];
                    const date = new Date(Number(latest.timestamp) * 1000);
                    console.log(`Latest Order Timestamp: ${latest.timestamp} (${date.toISOString()})`);
                    console.log(`Latest Order ID: ${latest.id}`);
                }
            } else {
                console.log('No orders found.');
            }
        } catch (e) { console.error(e); }
    });
});

req.write(query);
req.end();
