FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S ecopulse -G nodejs
COPY --from=build --chown=ecopulse:nodejs /app/package*.json ./
COPY --from=build --chown=ecopulse:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=ecopulse:nodejs /app/dist ./dist
COPY --from=build --chown=ecopulse:nodejs /app/prisma ./prisma
USER ecopulse
EXPOSE 4000
CMD ["node", "dist/index.js"]
