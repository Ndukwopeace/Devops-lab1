FROM node:22.9.0-alpine3.20 AS deps
WORKDIR /app
# Dependency files first so this layer is cached until they change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.9.0-alpine3.20
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# The official image ships a non-root "node" user.
USER node
EXPOSE 3001
CMD ["node", "src/server.js"]
