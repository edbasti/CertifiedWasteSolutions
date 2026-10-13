# Certified Waste Solutions

Browser portal for drivers, managers, and admins. The repo is a Vite + React + TypeScript web app, a Hono API, and a shared package. Data lives in Supabase Postgres. Requires Node 22.

## Run

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API health: http://localhost:8787/health

Run one process with `npm run dev:web` or `npm run dev:api`.

## Database

Copy `.env.example` to `.env` and set `DATABASE_URL` to the Supabase Postgres connection string (Project Settings → Database → URI, direct connection on port 5432).

## Demo data

```bash
npm run db:seed
```

This replaces every row in the connected Supabase database with demo accounts. Every seeded account uses the password `demo-password`:

- jordan@cws.local, admin
- chino@cws.local, manager
- alex.rivera@cws.local, driver, with the September 30 route
- sam.thompson@cws.local, driver

Sign in at the web app. Drivers open the route day. Managers and admins open the portal, where an admin can add a driver and reset that driver's password.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```
