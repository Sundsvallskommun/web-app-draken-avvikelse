#Backend
# Install dependencies only when needed
FROM node:22-slim AS deps

RUN apt-get update
RUN apt-get install -y openssl
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# RUN yarn build
RUN yarn build 2>&1 || true && echo "---BUILD EXIT CODE: $?---" && ls -la ./dist/ || echo "dist/ does not exist"

# Production image, copy all the files and run next
FROM node:22-slim AS runner
RUN apt-get update
RUN apt-get install -y openssl
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /app/ ./

#Temporary folder for sessions before redis is implemeted
RUN mkdir -p /app/data/sessions /app/data/logs /app/data/database && chown -R nodejs:nodejs /app/data

USER nodejs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "./dist/server.js"]
