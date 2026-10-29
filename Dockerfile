FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV NODE_ENV=production \
    PORT=4173 \
    HOST=0.0.0.0

WORKDIR /app

RUN npm install --global pnpm@9.15.5

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --chown=pwuser:pwuser . .

USER pwuser
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
