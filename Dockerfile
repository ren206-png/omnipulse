FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install production deps (tsx is now a production dependency so it will be installed).
# Skip postinstall (prisma generate) since the Prisma client is pre-committed.
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
