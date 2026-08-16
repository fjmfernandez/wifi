# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/mikrotik/package.json packages/mikrotik/package.json
COPY apps/site-agent/package.json apps/site-agent/package.json
RUN pnpm install --frozen-lockfile --filter @wifi/site-agent...

COPY packages/mikrotik packages/mikrotik
COPY apps/site-agent apps/site-agent
RUN pnpm --filter @wifi/mikrotik build && pnpm --filter @wifi/site-agent build
RUN pnpm --filter @wifi/site-agent --prod deploy --legacy /opt/site-agent

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /opt/site-agent/ ./
RUN mkdir -p /var/lib/wifi-site-agent && chown node:node /var/lib/wifi-site-agent
USER node
VOLUME ["/var/lib/wifi-site-agent"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3004/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
