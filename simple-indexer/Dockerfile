FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Create volume mount point for persistence
VOLUME /app/data

# Environment variable for DB path to use the volume
ENV DB_PATH=/app/data/orders.json

EXPOSE 42000

CMD ["node", "server.js"]
