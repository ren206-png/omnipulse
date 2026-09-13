FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install ALL deps including devDependencies (needed for tsc build).
# NODE_ENV=production is set by Railway which normally skips devDeps,
# so we explicitly force --include=dev. Skip postinstall (prisma generate)
# since the client is pre-committed. Then compile TypeScript.
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts --include=dev && npm run build

EXPOSE 3001

CMD ["node", "--import", "tsx/esm", "apps/api/dist/src/index.js"]
