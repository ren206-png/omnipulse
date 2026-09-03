FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install deps and build (same as original Nixpacks command)
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts && ./node_modules/.bin/prisma generate && npm run build

EXPOSE 3001

CMD ["node", "apps/api/dist/src/index.js"]
