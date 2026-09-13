FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first (needed for monorepo context)
COPY . .

# Install deps skipping postinstall (which runs prisma generate before pg is ready),
# then run prisma generate manually with a dummy DATABASE_URL so prisma.config.ts
# can instantiate the pg Pool without a real connection string.
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts \
    && DATABASE_URL="postgresql://x:x@localhost/x" ./node_modules/.bin/prisma generate

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
