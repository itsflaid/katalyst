# Katalyst (SvelteKit edition)

Business decision-support copilot buat UMKM. Ini rewrite dari versi hackathon
(Next.js + Prisma + NextAuth) pakai stack: SvelteKit + better-auth + Drizzle.

Prinsip arsitektur tetap sama: engine TypeScript deterministik yang selalu
megang hitungan (revenue, margin, simulasi), LLM cuma bantu jelasin — bukan
sebaliknya.

## Stack
- SvelteKit
- Drizzle ORM (Postgres)
- better-auth
- Tailwind CSS

## Setup
1. `cp .env.example .env`, isi `DATABASE_URL` & `BETTER_AUTH_SECRET`
2. `npm install`
3. `npx drizzle-kit migrate`
4. `npm run db:seed`
5. `npm run dev`

TODO: lengkapin bagian demo login + screenshot.
