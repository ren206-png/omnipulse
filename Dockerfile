FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install ALL deps (including devDependencies needed for the TypeScript build),
# skip postinstall to avoid prisma generate failing, then build TypeScript.
# The Prisma client is pre-generated and committed to the repo.
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts && npm run build

EXPOSE 3001

CMD ["node", "--import", "tsx/esm", "apps/api/dist/src/index.js"]
