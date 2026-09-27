FROM node:24-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS build

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npm run generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

RUN npm pkg set dependencies.prisma="$(node -p 'require("./package.json").devDependencies.prisma')" \
    && npm pkg delete devDependencies.prisma \
    && npm prune --omit=dev --ignore-scripts

FROM base AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LOG_LEVEL=info \
    DATABASE_URL=file:/data/basket.db

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh

RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    && mkdir -p /data \
    && chown node:node /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["sh", "/app/scripts/entrypoint.sh"]
CMD ["node", "dist/src/server.js"]