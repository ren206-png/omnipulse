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
# Build args are baked in at build time for Next.js NEXT_PUBLIC_ vars
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_DEV_MODE=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_DEV_MODE=$NEXT_PUBLIC_DEV_MODE
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
