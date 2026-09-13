FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Install deps
RUN cd apps/api && npm install --legacy-peer-deps --ignore-scripts

# Copy rest of source (this layer changes often)
COPY apps/api/src ./apps/api/src
COPY apps/api/generated ./apps/api/generated
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json

# Regenerate Prisma client with the installed version
RUN cd apps/api && ./node_modules/.bin/prisma generate

EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
