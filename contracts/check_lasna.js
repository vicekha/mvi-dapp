const body = {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [{
        to: "0x7EB1299099c2d781a28ac21f8D5cF0137E6C37AC",
        data: "0x01fbac8f"
    }, "latest"],
    id: 1
};

fetch("https://lasna-rpc.rnk.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
})
    .then(r => r.json())
    .then(j => console.log("Result:", j.result))
    .catch(e => console.error(e));
