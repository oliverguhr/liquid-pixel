FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY *.js index.html style.css ./
COPY scripts/serve.cjs scripts/multiplayer.cjs ./scripts/

LABEL org.opencontainers.image.source="https://github.com/oliverguhr/liquid-pixel"

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT, { method: 'HEAD', signal: AbortSignal.timeout(2000) }).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "scripts/serve.cjs"]
