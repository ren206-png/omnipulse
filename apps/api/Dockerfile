FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9

# ── Install dependencies ───────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# ── Build ──────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
# Generate Prisma client before compiling
RUN npx prisma generate
RUN pnpm build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output + generated prisma client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
