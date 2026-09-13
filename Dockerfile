FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Disable production mode so npm installs devDependencies (needed for tsc).
# Skip postinstall lifecycle scripts (avoids prisma generate running prematurely
# since the Prisma client is already pre-committed to the repo).
RUN npm config set production false
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts && npm run build

EXPOSE 3001

CMD ["node", "--import", "tsx/esm", "apps/api/dist/src/index.js"]
