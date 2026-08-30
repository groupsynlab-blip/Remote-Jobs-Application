FROM node:20-slim

# Install native build deps for better-sqlite3 and whatsapp-web.js
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
