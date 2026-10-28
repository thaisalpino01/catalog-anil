FROM node:24-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    TZ=America/Sao_Paulo

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY seed ./seed

RUN apk add --no-cache tzdata && mkdir -p /data && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
