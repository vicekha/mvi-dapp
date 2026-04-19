# AutoSwap Agent Server — Railway/Fly/Render ready
FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Railway injects PORT; HTTP+WS share it (see server.js)
ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server.js"]
