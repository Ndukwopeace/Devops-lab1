FROM node:22.9.0-alpine3.20 AS build
WORKDIR /app
# Dependency files first so this layer is cached until they change.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.9.0-alpine3.20
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
# The official image ships a non-root "node" user.
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
