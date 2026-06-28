FROM node:20-alpine
WORKDIR /app

# Install dependencies (skip postinstall so prisma generate runs after)
COPY package.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy source and generate Prisma client + compile TypeScript
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN npm run build

EXPOSE 4000
ENV NODE_ENV=production

# Run migrations then start server
CMD ["sh", "-c", "echo '=== ENV CHECK ===' && echo PORT=$PORT && echo NODE_ENV=$NODE_ENV && echo DB=${DATABASE_URL:0:30} && echo REDIS=${REDIS_URL:0:20} && echo JWT=${JWT_SECRET:0:8} && echo '=== STARTING ===' && node dist/src/index.js 2>&1"]
