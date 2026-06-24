import cors from 'cors';
import express from 'express';
import {
  CreateProspectRequestSchema,
  CreateUnitRequestSchema,
  UpdateProspectStatusRequestSchema,
  UpdateTaskStateRequestSchema,
  UpdateUnitRequestSchema,
  CreateTaskRequestSchema,
  UpdateProspectRequestSchema
} from '@hpos/contracts';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { applyStatusRules } from './rules.js';
import {
  createProspect,
  createUnit,
  getProspectDetail,
  listProspects,
  listTasks,
  listUnits,
  updateProspectStatus,
  updateTaskState,
  updateUnit,
  deleteUnit,
  deleteProspect,
  createTask,
  listActivityEvents,
  updateProspect
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

  if (!id) {
    throw new Error('Route id parameter is required');
  }

  return id;
};

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

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

    if (!unit) {
      response.sendStatus(404);
      return;
    }

    response.json(unit);
  })
);

app.get(
  '/prospects',
  asyncRoute(async (_request, response) => {
    response.json(await listProspects());
  })
);

app.get(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const detail = await getProspectDetail(routeId(request));

    if (!detail) {
      response.sendStatus(404);
      return;
    }

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
  '/prospects/:id/status',
  asyncRoute(async (request, response) => {
    const payload = UpdateProspectStatusRequestSchema.parse(request.body);
    const result = await updateProspectStatus(
      routeId(request),
      payload.status,
      (prospect, openTasks, units) =>
        applyStatusRules(payload.status, {
          prospect,
          units,
          openTasks,
          now: new Date()
        })
    );

    if (!result) {
      response.sendStatus(404);
      return;
    }

    response.json(result);
  })
);

app.get(
  '/tasks',
  asyncRoute(async (_request, response) => {
    response.json(await listTasks());
  })
);

app.patch(
  '/tasks/:id/state',
  asyncRoute(async (request, response) => {
    const payload = UpdateTaskStateRequestSchema.parse(request.body);
    const task = await updateTaskState(routeId(request), payload.state);

    if (!task) {
      response.sendStatus(404);
      return;
    }

    response.json(task);
  })
);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Invalid request body', issues: error.issues });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Leasing CRM API listening on http://localhost:${port}`);
});

// ─── Paste these routes into apps/backend/src/server.ts ─────────────────────
// Add these to the import from './repository.js':
//   deleteUnit, deleteProspect, createTask, listActivityEvents

// ─── Additional imports needed at the top of server.ts ───────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// UNITS — delete
// ─────────────────────────────────────────────────────────────────────────────

app.delete(
  '/units/:id',
  asyncRoute(async (request, response) => {
    const deleted = await deleteUnit(routeId(request));
    if (!deleted) {
      response.sendStatus(404);
      return;
    }
    response.sendStatus(204);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PROSPECTS — delete + update (full patch, not just status)
// ─────────────────────────────────────────────────────────────────────────────

app.delete(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const deleted = await deleteProspect(routeId(request));
    if (!deleted) {
      response.sendStatus(404);
      return;
    }
    response.sendStatus(204);
  })
);

app.post(
  '/tasks',
  asyncRoute(async (request, response) => {
    // Inline validation until CreateTaskRequestSchema is wired through contracts:
    const { title, dueDate, assignee, prospectId } = request.body as {
      title: string;
      dueDate: string;
      assignee: string;
      prospectId: string;
    };
    const task = await createTask({ title, dueDate, assignee, prospectId });
    response.status(201).json(task);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY — global feed
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/activity',
  asyncRoute(async (_request, response) => {
    response.json(await listActivityEvents());
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// UNITS — delete
// ─────────────────────────────────────────────────────────────────────────────

app.delete(
  '/units/:id',
  asyncRoute(async (request, response) => {
    const deleted = await deleteUnit(routeId(request));
    if (!deleted) {
      response.sendStatus(404);
      return;
    }
    response.sendStatus(204);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PROSPECTS — full update (name, contact, assignee, assignedUnitId)
// ─────────────────────────────────────────────────────────────────────────────

// Add updateProspect to repository imports and implementation (see below).
// Add UpdateProspectRequestSchema to the import from '@hpos/contracts'.

app.patch(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const payload = UpdateProspectRequestSchema.parse(request.body);
    const prospect = await updateProspect(routeId(request), payload);

    if (!prospect) {
      response.sendStatus(404);
      return;
    }

    response.json(prospect);
  })
);

app.delete(
  '/prospects/:id',
  asyncRoute(async (request, response) => {
    const deleted = await deleteProspect(routeId(request));
    if (!deleted) {
      response.sendStatus(404);
      return;
    }
    response.sendStatus(204);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// TASKS — create + list already present; add create endpoint
// ─────────────────────────────────────────────────────────────────────────────

// Add CreateTaskRequestSchema to @hpos/contracts/src/leasing-crm.ts:
//
//   export const CreateTaskRequestSchema = TaskSchema.omit({ id: true, state: true });
//   export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
//
// Then export it from packages/contracts/src/index.ts.

app.post(
  '/tasks',
  asyncRoute(async (request, response) => {
    // Inline validation until CreateTaskRequestSchema is wired through contracts:
    const { title, dueDate, assignee, prospectId } = request.body as {
      title: string;
      dueDate: string;
      assignee: string;
      prospectId: string;
    };
    const task = await createTask({ title, dueDate, assignee, prospectId });
    response.status(201).json(task);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY — global feed
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/activity',
  asyncRoute(async (_request, response) => {
    response.json(await listActivityEvents());
  })
);