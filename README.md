# OpenLiveSlide

Open-source interactive presentations — an AhaSlides-style platform for running polls, quizzes, Q&A, and word clouds with a live audience.

> Status: early scaffolding. Milestone 1 (monorepo bootstrap) complete; interaction features land in subsequent milestones.

## Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS
- **Realtime server**: Node.js, Fastify, Socket.IO (with Redis adapter for horizontal scale)
- **Database**: PostgreSQL via Prisma
- **Auth**: NextAuth (Auth.js) Credentials provider for presenters; audience joins anonymously via 6-character code
- **Tooling**: pnpm workspaces + Turborepo, TypeScript, zod, Prettier

## Repository layout

```
apps/
  web/          Next.js app (presenter dashboard, editor, presenter view, audience join)
  realtime/     Socket.IO gateway (Fastify + Redis adapter)
packages/
  db/           Prisma schema + client
  shared/       Cross-app types: zod schemas, Socket.IO event types, join code helpers
docker/
  docker-compose.yml  Postgres + Redis for local dev
```

## Local development

Prerequisites: Node 20+, pnpm 9+, Docker.

```bash
# 1. install deps
pnpm install

# 2. start Postgres + Redis
docker compose -f docker/docker-compose.yml up -d

# 3. configure env
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/realtime/.env.example apps/realtime/.env

# 4. database
pnpm db:generate
pnpm db:migrate

# 5. run web (3000) and realtime (4000) in parallel
pnpm dev
```

## Roadmap

1. ✅ Repo bootstrap (monorepo, Prisma schema, Next.js + realtime skeleton, docker-compose)
2. Auth + Deck CRUD
3. Slide editor (content slides)
4. Realtime session + room model
5. Poll slide end-to-end (first interactive feature)
6. Quiz with scoring + leaderboard
7. Q&A with upvotes
8. Word cloud
9. Presenter view polish (reveal.js, QR code)
10. Self-host docs + Docker production image

## License

MIT — see [LICENSE](./LICENSE).
