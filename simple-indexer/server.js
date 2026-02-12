const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const cors = require('cors');
const { getOrders, getOrder } = require('./db');
const { runIndexer } = require('./indexer');

// Define GraphQL Schema
const schema = buildSchema(`
  type Order {
    id: String!
    maker: String!
    tokenIn: String!
    tokenOut: String!
    amountIn: String!
    amountOut: String!
    typeIn: Int!
    typeOut: Int!
    targetChainId: String!
    timestamp: String!
    status: Int!
    filledAmount: String!
    chainId: Int!
    txHash: String!
    expiration: String!
  }

  input OrderFilter {
    targetChainId: String
    status: Int
    maker: String
  }

  type Query {
    orders(where: OrderFilter, limit: Int, orderBy: String, orderDirection: String): [Order]
    order(id: String!): Order
  }
`);

// Define Resolvers
const root = {
    orders: ({ where, limit, orderBy, orderDirection }) => {
        let all = getOrders();

        if (where) {
            console.log('Querying with filter:', where);
            if (where.maker) {
                all = all.filter(o => o.maker.toLowerCase() === where.maker.toLowerCase());
            }
            if (where.status !== undefined) {
                all = all.filter(o => o.status === where.status);
            }
            if (where.targetChainId) {
                all = all.filter(o => o.targetChainId === where.targetChainId || o.targetChainId === "0");
                console.log(`Filtered by targetChainId ${where.targetChainId}: ${all.length} matches`);
            }
        } else {
            console.log('Querying without filter');
        }

        // Sort
        if (orderBy === 'timestamp') {
            const dir = orderDirection === 'asc' ? 1 : -1;
            all.sort((a, b) => (Number(a.timestamp) - Number(b.timestamp)) * dir);
        } else {
            // Default desc
            all.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
        }

        if (limit) {
            all = all.slice(0, limit);
        }
        console.log(`Returning ${all.length} orders`);
        return all;
    },
    order: ({ id }) => {
        return getOrder(id);
    }
};

const app = express();
app.use(cors());

app.use('/graphql', graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
}));

const PORT = 42069;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/graphql`);
    // Start the background indexer too
    runIndexer();
});
