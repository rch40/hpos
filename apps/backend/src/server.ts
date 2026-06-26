import cors from 'cors';
import express from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { migrate } from './migrate.js';
import {
  CreateProspectRequestSchema,
  CreateTourRequestSchema,
  CreateUnitRequestSchema,
  ProspectFilterSchema,
  RecordTourOutcomeRequestSchema,
  RescheduleTourRequestSchema,
  UpdateProspectRequestSchema,
  UpdateProspectStatusRequestSchema,
  UpdateTaskStateRequestSchema,
  UpdateUnitRequestSchema,
  CreateTaskRequestSchema
} from '@hpos/contracts';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { applyStatusRules } from './rules.js';
import {
  createProspect,
  createTask,
  createTour,
  createUnit,
  deleteProspect,
  deleteUnit,
  DoubleBookingError,
  getProspectDetail,
  getToursByProspect,
  listActivityEvents,
  listProspects,
  listTasks,
  listTours,
  listUnits,
  recordTourOutcome,
  rescheduleTour,
  updateProspect,
  updateProspectStatus,
  updateTaskState,
  updateUnit
} from './repository.js';

const app = express();
app.use(cors());
app.use(express.json());

const asyncRoute =
  (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response).catch(next);
  };

const routeId = (request: Request): string => {
  const id = request.params.id;
  if (!id) throw new Error('Route id parameter is required');
  return id;
};

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

// ─── Units ───────────────────────────────────────────────────────────────────

app.get(
  '/units',
  asyncRoute(async (_request, response) => {
    response.json(await listUnits());
  })
);

app.post(
  '/units',
  asyncRoute(async (request, response) => {
    const payload = CreateUnitRequestSchema.parse(request.body);
    const unit = await createUnit(payload);
    response.status(201).json(unit);
  })
);

app.patch(
  '/units/:id',
  asyncRoute(async (request, response) => {
    const payload = UpdateUnitRequestSchema.parse(request.body);
    const unit = await updateUnit(routeId(request), payload);
    if (!unit) { response.sendStatus(404); return; }
    response.json(unit);
  })
);

app.delete(
  '/units/:id',
  asyncRoute(async (request, response) => {
    const deleted = await deleteUnit(routeId(request));
    if (!deleted) { response.sendStatus(404); return; }
    response.sendStatus(204);
  })
);

// ─── Prospects ───────────────────────────────────────────────────────────────

app.get(
  '/prospects',
  asyncRoute(async (request, response) => {
    const filter = ProspectFilterSchema.parse(request.query);
    response.json(await listProspects(filter));
  })
);

app.get(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const detail = await getProspectDetail(routeId(request));
    if (!detail) { response.sendStatus(404); return; }
    response.json(detail);
  })
);

app.post(
  '/prospects',
  asyncRoute(async (request, response) => {
    const payload = CreateProspectRequestSchema.parse(request.body);
    const prospect = await createProspect(payload);
    response.status(201).json(prospect);
  })
);

app.patch(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const payload = UpdateProspectRequestSchema.parse(request.body);
    const prospect = await updateProspect(routeId(request), payload);
    if (!prospect) { response.sendStatus(404); return; }
    response.json(prospect);
  })
);

app.patch(
  '/prospects/:id/status',
  asyncRoute(async (request, response) => {
    const payload = UpdateProspectStatusRequestSchema.parse(request.body);
    const result = await updateProspectStatus(
      routeId(request),
      payload.status,
      (prospect, openTasks, units) =>
        applyStatusRules(payload.status, { prospect, units, openTasks, now: new Date() })
    );
    if (!result) { response.sendStatus(404); return; }
    response.json(result);
  })
);

app.delete(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const deleted = await deleteProspect(routeId(request));
    if (!deleted) { response.sendStatus(404); return; }
    response.sendStatus(204);
  })
);

// ─── Tours ───────────────────────────────────────────────────────────────────

app.get(
  '/tours',
  asyncRoute(async (_request, response) => {
    response.json(await listTours());
  })
);

app.get(
  '/prospects/:id/tours',
  asyncRoute(async (request, response) => {
    response.json(await getToursByProspect(routeId(request)));
  })
);

app.post(
  '/tours',
  asyncRoute(async (request, response) => {
    const payload = CreateTourRequestSchema.parse(request.body);
    const tour = await createTour(payload);

    // Scheduling a tour transitions the prospect to tour_scheduled, firing the rule engine
    // with the real tour time so the "Confirm 24h prior" task lands at the right due date.
    const scheduledAt = new Date(payload.scheduledAt);
    await updateProspectStatus(
      payload.prospectId,
      'tour_scheduled',
      (prospect, openTasks, units) =>
        applyStatusRules('tour_scheduled', {
          prospect,
          units,
          openTasks,
          now: new Date(),
          tourScheduledAt: scheduledAt
        })
    );

    response.status(201).json(tour);
  })
);

app.patch(
  '/tours/:id/outcome',
  asyncRoute(async (request, response) => {
    const { outcome } = RecordTourOutcomeRequestSchema.parse(request.body);
    const tour = await recordTourOutcome(routeId(request), outcome);
    if (!tour) { response.sendStatus(404); return; }

    // completed → toured, no_show/cancelled → lost
    const nextStatus = outcome === 'completed' ? 'toured' : 'lost';
    await updateProspectStatus(
      tour.prospectId,
      nextStatus,
      (prospect, openTasks, units) =>
        applyStatusRules(nextStatus, { prospect, units, openTasks, now: new Date() })
    );

    response.json(tour);
  })
);

app.patch(
  '/tours/:id',
  asyncRoute(async (request, response) => {
    const { scheduledAt } = RescheduleTourRequestSchema.parse(request.body);
    const tour = await rescheduleTour(routeId(request), scheduledAt);
    if (!tour) { response.sendStatus(404); return; }
    response.json(tour);
  })
);

// ─── Tasks ───────────────────────────────────────────────────────────────────

app.get(
  '/tasks',
  asyncRoute(async (_request, response) => {
    response.json(await listTasks());
  })
);

app.post(
  '/tasks',
  asyncRoute(async (request, response) => {
    const payload = CreateTaskRequestSchema.parse(request.body);
    const task = await createTask(payload);
    response.status(201).json(task);
  })
);

app.patch(
  '/tasks/:id/state',
  asyncRoute(async (request, response) => {
    const payload = UpdateTaskStateRequestSchema.parse(request.body);
    const task = await updateTaskState(routeId(request), payload.state);
    if (!task) { response.sendStatus(404); return; }
    response.json(task);
  })
);

// ─── Activity ─────────────────────────────────────────────────────────────────

app.get(
  '/activity',
  asyncRoute(async (_request, response) => {
    response.json(await listActivityEvents());
  })
);

// ─── Frontend (production) ────────────────────────────────────────────────────

const frontendDist = join(process.cwd(), 'apps/frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(join(frontendDist, 'index.html')));
}

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Invalid request body', issues: error.issues });
    return;
  }
  if (error instanceof DoubleBookingError) {
    response.status(409).json({ error: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);

migrate()
  .then(() => {
    app.listen(port, () => {
      console.log(`Leasing CRM API listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Migration failed, aborting startup:', err);
    process.exit(1);
  });
