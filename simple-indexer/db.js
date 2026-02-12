const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'orders.json');

let orders = [];

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            orders = JSON.parse(data);
            console.log(`Loaded ${orders.length} orders from DB.`);
        } catch (e) {
            console.error("Failed to load DB:", e);
            orders = [];
        }
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2));
}

function upsertOrder(order) {
    const index = orders.findIndex(o => o.id === order.id);
    if (index >= 0) {
        // Merge updates
        orders[index] = { ...orders[index], ...order };
    } else {
        orders.push(order);
    }
    saveDB();
}

function getOrders() {
    return orders;
}

function getOrder(id) {
    return orders.find(o => o.id === id);
}

// Initial load
loadDB();

module.exports = { upsertOrder, getOrders, getOrder };
