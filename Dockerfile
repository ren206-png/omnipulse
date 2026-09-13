FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install all deps including devDependencies (needed for tsc/tsx build tools).
# Unset NODE_ENV during install so npm doesn't skip devDeps, then restore for build.
# Skip postinstall lifecycle scripts (avoids prisma generate running prematurely
# since the Prisma client is already pre-committed to the repo).
RUN cd apps/api && unset NODE_ENV && npm install --legacy-peer-deps --ignore-scripts && npm run build

EXPOSE 3001

CMD ["node", "--import", "tsx/esm", "apps/api/dist/src/index.js"]
