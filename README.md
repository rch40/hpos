# HPOS Leasing CRM

HPOS technical assessment for a leasing and tours CRM. The project is scaffolded as an npm workspace monorepo with shared TypeScript/Zod contracts, an Express backend, and a React + Vite + Tailwind frontend.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop, or another Docker Compose-compatible runtime

## Install

```bash
npm install
```

Copy the local environment defaults:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Database

Start Postgres:

```bash
npm run db:up
```

This starts a Postgres 16 container on `localhost:5432` using:

```text
DATABASE_URL=postgres://hpos:hpos@localhost:5432/hpos
```

The first startup initializes the schema and seed data from `db/init/001_schema.sql`. If you need to reset the database, remove the Docker volume and start it again:

```bash
docker compose down -v
npm run db:up
```

## Run Full Stack Locally

Start Postgres first, then start the backend API in one terminal:

```bash
npm run dev:backend
```

The API runs at:

```text
http://localhost:4000
```

Start the frontend in another terminal:

```bash
npm run dev:frontend
```

Vite will print the local frontend URL, typically:

```text
http://localhost:5173
```

## Useful Commands

```bash
npm run typecheck --workspaces
npm run build --workspaces
```

## Workspace Layout

```text
apps/
  backend/      Express API and automation rule layer
  frontend/     React + Vite + Tailwind app
packages/
  contracts/    Shared Zod schemas and TypeScript types
```

The shared contract package is imported by both apps so server validation and frontend types come from the same schemas.
