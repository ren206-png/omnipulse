FROM node:20-alpine
WORKDIR /app

# Install dependencies (skip postinstall so prisma generate runs after)
COPY package.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy source and generate Prisma client + compile TypeScript
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN npm run build
# Copy Prisma runtime files (non-TS) into dist so Node can find them at runtime
RUN cp -r generated dist/

EXPOSE 4000
ENV NODE_ENV=production

CMD ["node", "dist/src/index.js"]
