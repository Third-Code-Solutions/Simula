# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

ARG NEXT_PUBLIC_SIMULA_API_URL
ARG NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v1
ARG NEXT_PUBLIC_SIMULA_ENVIRONMENT=local
ARG NEXT_PUBLIC_SIMULA_RELEASE_SHA
ARG NEXT_PUBLIC_SIMULA_TELEMETRY_ENABLED=false
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN corepack enable && corepack install --global pnpm@11.13.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN --mount=type=cache,id=s/df03b168-00ff-4dd7-be3c-1fd8afb54efc-/root/.cache/pnpm,target=/root/.cache/pnpm \
    pnpm --filter @simula/contracts build \
    && pnpm --filter @simula/web build

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=2s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
