# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ----- deps -----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile=false

# ----- builder -----
FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter @openliveslide/db prisma generate
RUN pnpm --filter @openliveslide/realtime build
RUN pnpm deploy --filter=@openliveslide/realtime --prod /app/deploy/realtime

# ----- runner -----
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S realtime -u 1001

COPY --from=builder /app/deploy/realtime ./
COPY --from=builder /app/apps/realtime/dist ./dist
COPY --from=builder /app/packages/db/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/packages/db/prisma ./prisma

USER realtime
EXPOSE 4000
ENV PORT=4000
CMD ["node", "dist/server.js"]
