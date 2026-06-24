# HPOS Leasing CRM Notes

## Current Tier

Scaffold started for Tier 0 with the required shared contracts package, backend app shell, and frontend app shell.

## Tradeoffs

- The repo already contained npm lockfiles, so the scaffold uses npm workspaces instead of switching package managers.
- Backend persistence is currently an in-memory repository so the API and rule-engine boundaries can be shaped before choosing Prisma, Drizzle, or another database layer.
- The Tier 1 automation logic is isolated in `apps/backend/src/rules.ts` so adding or testing a new status rule is a local change.

## AI Tool Disclosure

Codex was used to extract the assessment requirements from the provided Word document, review the proposed implementation plan, and create the initial scaffold.
