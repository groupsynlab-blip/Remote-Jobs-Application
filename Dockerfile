FROM node:20-slim

# Install native build deps for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Skip Chromium download for whatsapp-web.js (too large for build)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package files first for layer caching
COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Build Next.js (ignore lint errors to not block deploy)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

EXPOSE 3000

CMD ["npm", "start"]
