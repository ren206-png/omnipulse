FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root workspace files first for install
COPY package.json package-lock.json ./

# Copy api package files
COPY apps/api/package.json ./apps/api/package.json

# Copy prisma schema (needed for generate)
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/

# Install deps
RUN npm install --legacy-peer-deps --ignore-scripts --prefix apps/api

# Copy ALL source
COPY . .

# Generate Prisma client and compile TypeScript
RUN cd apps/api && ./node_modules/.bin/prisma generate && npm run build

EXPOSE 3001

CMD ["node", "apps/api/dist/src/index.js"]
