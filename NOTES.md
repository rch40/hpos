# HPOS Leasing CRM — Notes

## Tier Reached

Reached all five tiers.

**Tier 0** — Setup the project scaffold, shared contracts package, Unit & Prospect CRUD, list and detail views, manual status changes, and PostgreSQL setup.

**Tier 1** — Rule engine (`rules.ts`) for each status transition. Tasks panel with ability to mark done. Activity timeline that logs status changes.

**Tier 2** — Schedule and reschedule tours. Setting the tour outcome flips prospect status and runs the Tier 1 rules (`completed → toured`, `no_show/cancelled → lost`).xDouble-booking guard uses a `FOR UPDATE` lock and rejects tours on the same unit within a one-hour window.

**Tier 3** — Client-side search (name and email) and filter (status, unit, assignee). Sort by name or next tour date with ascending/descending.

**Tier 4** — Optimistic UI on status change (immediate update, red revert on failure). Form validation derived from the shared Zod schemas with per-field inline errors. Skeleton loading rows while the prospects list loads.

**Tier 5** — 16 rule engine unit tests (pure, no DB). 10 API integration tests (real Postgres, supertest). GitHub Actions CI workflow with a Postgres service container.

### What I Would Do Next

- Add assignee filter to Tier 3 (simple UI change)
- Update phone input to be appropriately typed (only allow numbers and correctly style)
- Paginate the prospects list — the client-side filtering won't scale past a few hundred rows.
- Add more tests, particularly tests for the reschedule double-booking path and for tour outcome → status transition through the HTTP layer.
- Show more activity event types (tour scheduled, tour rescheduled) in the timeline.

---

## Key Tradeoffs

**Raw SQL over an ORM.** I considered Drizzle, which is an ORM I am familiar with, but ultimately decided not to use it for this. `pg` with hand-written queries keeps the dependency surface small and makes the double-booking `FOR UPDATE` lock straightforward to express. The downside is no automatic migration generation; I used a simple sequential `.sql` file runner instead.

**Client-side filtering and sorting.** Filtering and sorting the loaded prospects array in React avoids async complexity (debounce, race conditions, cancellation) and keeps the backend very simple. However, it breaks down at scale, but for this usecase the full list fits in memory comfortably.

---

## AI Tool Disclosure

Claude Code (claude-sonnet-4-6 via the Claude Code CLI) was used throughout this project as a primary coding collaborator. Specific uses:

- **Architecture planning** — reviewed the assessment tiers and proposed the contracts layer, rule engine shape, and migration strategy before writing code.
- **Implementation** — generated the basic backend routes, repository functions, rule engine, migration runner, and frontend components. All generated code was reviewed, tested, and corrected where needed.
- **Test authorship** — wrote the rule engine unit tests and API integration test suite based on the implemented logic.
- **Debugging** — traced EADDRINUSE in tests back to the module-level `app.listen()` side effect; assisted in Railway setup and configuration resolutions.

Every decision in the repo — schema choices, locking strategy, client-side filtering rationale, the `FOR UPDATE` double-booking guard — I can explain and defend. The AI accelerated implementation velocity; understanding and judgement remained mine.
