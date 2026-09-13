FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Override NODE_ENV so npm installs devDependencies (needed for tsx to run TS directly).
# Skip postinstall lifecycle scripts (avoids prisma generate failing since
# the Prisma client is already pre-generated and committed to the repo).
ENV NODE_ENV=development
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts

# Restore production NODE_ENV for runtime
ENV NODE_ENV=production

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
