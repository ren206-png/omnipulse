FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install deps (skip tsc — tsx runs TS directly; Prisma client is pre-generated and committed)
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
