import type {
  ActivityEvent,
  CreateProspectRequest,
  CreateUnitRequest,
  Prospect,
  Task,
  Unit,
  UpdateUnitRequest
} from '@hpos/contracts';
import type { PoolClient, QueryResultRow } from 'pg';
import { pool } from './database.js';
import type { AutomationResult } from './rules.js';
import type { CreateTaskRequest, UpdateProspectRequest } from '@hpos/contracts';


type ProspectDetail = {
  prospect: Prospect;
  tasks: Task[];
  activityEvents: ActivityEvent[];
};

type UnitRow = QueryResultRow & {
  id: string;
  name: string;
  status: Unit['status'];
};

type ProspectRow = QueryResultRow & {
  id: string;
  name: string;
  email: string;
  phone: string;
  assigned_unit_id: string | null;
  status: Prospect['status'];
  assignee: string;
};

type TaskRow = QueryResultRow & {
  id: string;
  title: string;
  due_date: Date;
  assignee: string;
  prospect_id: string;
  state: Task['state'];
};

type ActivityEventRow = QueryResultRow & {
  id: string;
  type: ActivityEvent['type'];
  occurred_at: Date;
  prospect_id: string | null;
  unit_id: string | null;
  summary: string;
};

const toUnit = (row: UnitRow): Unit => ({
  id: row.id,
  name: row.name,
  status: row.status
});

const toProspect = (row: ProspectRow): Prospect => ({
  id: row.id,
  name: row.name,
  contact: {
    email: row.email,
    phone: row.phone
  },
  assignedUnitId: row.assigned_unit_id,
  status: row.status,
  assignee: row.assignee
});

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  dueDate: row.due_date.toISOString(),
  assignee: row.assignee,
  prospectId: row.prospect_id,
  state: row.state
});

const toActivityEvent = (row: ActivityEventRow): ActivityEvent => ({
  id: row.id,
  type: row.type,
  timestamp: row.occurred_at.toISOString(),
  prospectId: row.prospect_id,
  unitId: row.unit_id,
  summary: row.summary
});

const requireRow = <Row>(row: Row | undefined, tableName: string): Row => {
  if (!row) {
    throw new Error(`Expected ${tableName} row to be returned`);
  }

  return row;
};

export const listUnits = async (): Promise<Unit[]> => {
  const result = await pool.query<UnitRow>('SELECT id, name, status FROM units ORDER BY name');
  return result.rows.map(toUnit);
};

export const createUnit = async (payload: CreateUnitRequest): Promise<Unit> => {
  const result = await pool.query<UnitRow>(
    'INSERT INTO units (name, status) VALUES ($1, $2) RETURNING id, name, status',
    [payload.name, payload.status]
  );
  return toUnit(requireRow(result.rows[0], 'units'));
};

export const updateUnit = async (
  id: string,
  payload: UpdateUnitRequest
): Promise<Unit | undefined> => {
  const current = await pool.query<UnitRow>('SELECT id, name, status FROM units WHERE id = $1', [id]);

  if (!current.rows[0]) {
    return undefined;
  }

  const next = {
    ...toUnit(current.rows[0]),
    ...payload
  };

  const result = await pool.query<UnitRow>(
    'UPDATE units SET name = $2, status = $3 WHERE id = $1 RETURNING id, name, status',
    [id, next.name, next.status]
  );
  return toUnit(requireRow(result.rows[0], 'units'));
};

export const listProspects = async (): Promise<Prospect[]> => {
  const result = await pool.query<ProspectRow>(
    'SELECT id, name, email, phone, assigned_unit_id, status, assignee FROM prospects ORDER BY name'
  );
  return result.rows.map(toProspect);
};

export const getProspectDetail = async (id: string): Promise<ProspectDetail | undefined> => {
  const prospectResult = await pool.query<ProspectRow>(
    'SELECT id, name, email, phone, assigned_unit_id, status, assignee FROM prospects WHERE id = $1',
    [id]
  );
  const prospect = prospectResult.rows[0];

  if (!prospect) {
    return undefined;
  }

  const [tasksResult, eventsResult] = await Promise.all([
    pool.query<TaskRow>(
      'SELECT id, title, due_date, assignee, prospect_id, state FROM tasks WHERE prospect_id = $1 ORDER BY due_date',
      [id]
    ),
    pool.query<ActivityEventRow>(
      `SELECT id, type, occurred_at, prospect_id, unit_id, summary
       FROM activity_events
       WHERE prospect_id = $1
       ORDER BY occurred_at DESC`,
      [id]
    )
  ]);

  return {
    prospect: toProspect(prospect),
    tasks: tasksResult.rows.map(toTask),
    activityEvents: eventsResult.rows.map(toActivityEvent)
  };
};

export const createProspect = async (payload: CreateProspectRequest): Promise<Prospect> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<ProspectRow>(
      `INSERT INTO prospects (name, email, phone, assigned_unit_id, status, assignee)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, assigned_unit_id, status, assignee`,
      [
        payload.name,
        payload.contact.email,
        payload.contact.phone,
        payload.assignedUnitId ?? null,
        payload.status ?? 'new',
        payload.assignee
      ]
    );
    const prospect = toProspect(requireRow(result.rows[0], 'prospects'));

    // Log a prospect_created activity event so the timeline isn't empty
    await client.query(
      `INSERT INTO activity_events (type, prospect_id, unit_id, summary)
       VALUES ('prospect_created', $1, $2, $3)`,
      [
        prospect.id,
        prospect.assignedUnitId,
        `${prospect.name} added to the pipeline`
      ]
    );

    await client.query('COMMIT');
    return prospect;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateProspectStatus = async (
  id: string,
  status: Prospect['status'],
  buildAutomation: (prospect: Prospect, openTasks: Task[], units: Unit[]) => AutomationResult
): Promise<{ prospect: Prospect; automation: AutomationResult } | undefined> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const prospectResult = await client.query<ProspectRow>(
      `UPDATE prospects
       SET status = $2
       WHERE id = $1
       RETURNING id, name, email, phone, assigned_unit_id, status, assignee`,
      [id, status]
    );
    const prospectRow = prospectResult.rows[0];

    if (!prospectRow) {
      await client.query('ROLLBACK');
      return undefined;
    }

    const prospect = toProspect(prospectRow);
    const openTasks = await selectOpenTasks(client, prospect.id);
    const units = await selectUnits(client);
    const automation = buildAutomation(prospect, openTasks, units);

    for (const task of automation.tasksToCreate) {
      await client.query(
        `INSERT INTO tasks (title, due_date, assignee, prospect_id, state)
         VALUES ($1, $2, $3, $4, 'open')`,
        [task.title, task.dueDate, task.assignee, task.prospectId]
      );
    }

    for (const taskId of automation.taskIdsToClose) {
      await client.query('UPDATE tasks SET state = $2 WHERE id = $1', [taskId, 'done']);
    }

    for (const unitUpdate of automation.unitUpdates) {
      await client.query('UPDATE units SET status = $2 WHERE id = $1', [
        unitUpdate.id,
        unitUpdate.status
      ]);
    }

    for (const event of automation.events) {
      await client.query(
        `INSERT INTO activity_events (type, prospect_id, unit_id, summary)
         VALUES ($1, $2, $3, $4)`,
        [event.type, event.prospectId, event.unitId, event.summary]
      );
    }

    await client.query('COMMIT');
    return { prospect, automation };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listTasks = async (): Promise<Task[]> => {
  const result = await pool.query<TaskRow>(
    'SELECT id, title, due_date, assignee, prospect_id, state FROM tasks ORDER BY due_date'
  );
  return result.rows.map(toTask);
};

export const updateTaskState = async (
  id: string,
  state: Task['state']
): Promise<Task | undefined> => {
  const result = await pool.query<TaskRow>(
    `UPDATE tasks
     SET state = $2
     WHERE id = $1
     RETURNING id, title, due_date, assignee, prospect_id, state`,
    [id, state]
  );
  const task = result.rows[0];
  return task ? toTask(task) : undefined;
};

const selectOpenTasks = async (client: PoolClient, prospectId: string): Promise<Task[]> => {
  const result = await client.query<TaskRow>(
    `SELECT id, title, due_date, assignee, prospect_id, state
     FROM tasks
     WHERE prospect_id = $1 AND state = 'open'
     ORDER BY due_date
     FOR UPDATE`,
    [prospectId]
  );
  return result.rows.map(toTask);
};

const selectUnits = async (client: PoolClient): Promise<Unit[]> => {
  const result = await client.query<UnitRow>('SELECT id, name, status FROM units ORDER BY name');
  return result.rows.map(toUnit);
};

// ─── DELETE UNIT ─────────────────────────────────────────────────────────────

export const deleteUnit = async (id: string): Promise<boolean> => {
  const result = await pool.query<{ id: string }>(
    'DELETE FROM units WHERE id = $1 RETURNING id',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
};

// ─── DELETE PROSPECT ──────────────────────────────────────────────────────────
// Tasks cascade-delete via ON DELETE CASCADE.
// Activity events cascade-delete via ON DELETE CASCADE.

export const deleteProspect = async (id: string): Promise<boolean> => {
  const result = await pool.query<{ id: string }>(
    'DELETE FROM prospects WHERE id = $1 RETURNING id',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
};

// ─── CREATE TASK ──────────────────────────────────────────────────────────────
// Type for the payload — add to @hpos/contracts if you want schema validation.
// Minimum fields match the Task schema minus id and state.

type CreateTaskPayload = {
  title: string;
  dueDate: string; // ISO datetime
  assignee: string;
  prospectId: string;
};

export const createTask = async (payload: CreateTaskPayload): Promise<Task> => {
  const result = await pool.query<TaskRow>(
    `INSERT INTO tasks (title, due_date, assignee, prospect_id, state)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING id, title, due_date, assignee, prospect_id, state`,
    [payload.title, payload.dueDate, payload.assignee, payload.prospectId]
  );
  return toTask(requireRow(result.rows[0], 'tasks'));
};

// ─── LIST ACTIVITY EVENTS (global) ───────────────────────────────────────────
// Already covered per-prospect inside getProspectDetail.
// This variant returns all events for a dashboard / audit view.

export const listActivityEvents = async (): Promise<ActivityEvent[]> => {
  const result = await pool.query<ActivityEventRow>(
    `SELECT id, type, occurred_at, prospect_id, unit_id, summary
     FROM activity_events
     ORDER BY occurred_at DESC
     LIMIT 200`
  );
  return result.rows.map(toActivityEvent);
};

export const updateProspect = async (
  id: string,
  payload: UpdateProspectRequest
): Promise<Prospect | undefined> => {
  const currentResult = await pool.query<ProspectRow>(
    'SELECT id, name, email, phone, assigned_unit_id, status, assignee FROM prospects WHERE id = $1',
    [id]
  );
  if (!currentResult.rows[0]) return undefined;

  const current = toProspect(currentResult.rows[0]);
  const next = {
    name:           payload.name            ?? current.name,
    email:          payload.contact?.email  ?? current.contact.email,
    phone:          payload.contact?.phone  ?? current.contact.phone,
    assignee:       payload.assignee        ?? current.assignee,
    assignedUnitId: 'assignedUnitId' in payload
      ? (payload.assignedUnitId ?? null)
      : current.assignedUnitId,
  };

  const result = await pool.query<ProspectRow>(
    `UPDATE prospects
     SET name = $2, email = $3, phone = $4, assignee = $5, assigned_unit_id = $6
     WHERE id = $1
     RETURNING id, name, email, phone, assigned_unit_id, status, assignee`,
    [id, next.name, next.email, next.phone, next.assignee, next.assignedUnitId]
  );
  return toProspect(requireRow(result.rows[0], 'prospects'));
};