import { ApolloClient, InMemoryCache } from '@apollo/client';

export const apolloClient = new ApolloClient({
    uri: 'http://localhost:42069', // Ponder default port
    cache: new InMemoryCache(),
});
