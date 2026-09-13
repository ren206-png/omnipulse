FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install deps only — the Prisma client is pre-generated and committed to the repo,
# so we skip prisma generate entirely (avoids pg resolution issues in Docker).
# --ignore-scripts prevents the postinstall hook from trying to run prisma generate.
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
