FROM node:20-alpine AS base
WORKDIR /app

# ── Install dependencies ───────────────────────────────────────────────────────
FROM base AS deps
COPY package.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

# ── Build ──────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps --ignore-scripts --omit=dev

# Copy compiled output + generated prisma client + migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000
ENV NODE_ENV=production

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
