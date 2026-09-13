FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Install deps then explicitly regenerate Prisma client so runtime and client always match
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts && ./node_modules/.bin/prisma generate

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
