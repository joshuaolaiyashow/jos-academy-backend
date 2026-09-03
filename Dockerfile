# Step 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package definitions and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code and config files
COPY . .

# Generate Prisma client and build NestJS production bundle
RUN npx prisma generate
RUN npm run build

# Step 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and production node_modules
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

# Push Prisma schema to DB on startup and start NestJS app
CMD ["sh", "-c", "npx prisma db push && node dist/main.js"]
