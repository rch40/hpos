/**
 * Integration tests — require a running Postgres database.
 * Set DATABASE_URL (or the default localhost:5432 connection) before running.
 *
 * Each suite seeds its own data and cleans up afterwards so tests are isolated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { pool } from '../database.js';
import { migrate } from '../migrate.js';

// Run migrations once before the suite so the schema is up to date.
beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await pool.end();
});

// ─── Units ───────────────────────────────────────────────────────────────────

describe('POST /units', () => {
  let createdId: string;

  afterAll(async () => {
    if (createdId) await pool.query('DELETE FROM units WHERE id = $1', [createdId]);
  });

  it('creates a unit and returns 201 with the new unit', async () => {
    const res = await request(app)
      .post('/units')
      .send({ name: 'Test Unit 999', status: 'available' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Unit 999');
    expect(res.body.status).toBe('available');
    expect(res.body.id).toBeTruthy();
    createdId = res.body.id as string;
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/units').send({ status: 'available' });
    expect(res.status).toBe(400);
  });
});

describe('GET /units', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── Prospects ───────────────────────────────────────────────────────────────

describe('POST /prospects', () => {
  let createdId: string;

  afterAll(async () => {
    if (createdId) {
      await pool.query('DELETE FROM activity_events WHERE prospect_id = $1', [createdId]);
      await pool.query('DELETE FROM tasks WHERE prospect_id = $1', [createdId]);
      await pool.query('DELETE FROM prospects WHERE id = $1', [createdId]);
    }
  });

  it('creates a prospect at status new and returns 201', async () => {
    const res = await request(app).post('/prospects').send({
      name: 'Test Prospect',
      contact: { email: 'test@example.com', phone: '5559990000' },
      assignee: 'Agent Test',
      assignedUnitId: null,
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Prospect');
    expect(res.body.status).toBe('new');
    createdId = res.body.id as string;
  });

  it('returns 400 for an invalid email', async () => {
    const res = await request(app).post('/prospects').send({
      name: 'Bad Prospect',
      contact: { email: 'not-an-email', phone: '5550000000' },
      assignee: 'Agent Test',
      assignedUnitId: null,
    });
    expect(res.status).toBe(400);
  });
});

// ─── Status change → automation rules ────────────────────────────────────────

describe('PATCH /prospects/:id/status — rule engine integration', () => {
  let prospectId: string;

  beforeAll(async () => {
    const res = await request(app).post('/prospects').send({
      name: 'Rule Test Prospect',
      contact: { email: 'rules@example.com', phone: '5551110000' },
      assignee: 'Agent Rules',
      assignedUnitId: null,
    });
    prospectId = res.body.id as string;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM activity_events WHERE prospect_id = $1', [prospectId]);
    await pool.query('DELETE FROM tasks WHERE prospect_id = $1', [prospectId]);
    await pool.query('DELETE FROM prospects WHERE id = $1', [prospectId]);
  });

  it('transitioning to contacted creates a follow-up task', async () => {
    const res = await request(app)
      .patch(`/prospects/${prospectId}/status`)
      .send({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.prospect.status).toBe('contacted');

    // Verify the task was created in the database
    const { rows } = await pool.query<{ title: string }>(
      'SELECT title FROM tasks WHERE prospect_id = $1',
      [prospectId]
    );
    expect(rows.some((r) => r.title.includes('Send tour availability'))).toBe(true);
  });

  it('transitioning to lost closes open tasks', async () => {
    const res = await request(app)
      .patch(`/prospects/${prospectId}/status`)
      .send({ status: 'lost' });

    expect(res.status).toBe(200);

    const { rows } = await pool.query<{ state: string }>(
      "SELECT state FROM tasks WHERE prospect_id = $1 AND state = 'open'",
      [prospectId]
    );
    expect(rows).toHaveLength(0);
  });
});

// ─── Tours — double-booking guard ────────────────────────────────────────────

describe('POST /tours — double-booking', () => {
  let prospectId: string;
  let unitId: string;
  let tourId: string;

  beforeAll(async () => {
    const pRes = await request(app).post('/prospects').send({
      name: 'Tour Test Prospect',
      contact: { email: 'tour@example.com', phone: '5552220000' },
      assignee: 'Agent Tours',
      assignedUnitId: null,
    });
    prospectId = pRes.body.id as string;

    const uRes = await request(app)
      .post('/units')
      .send({ name: 'Tour Test Unit', status: 'available' });
    unitId = uRes.body.id as string;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM tours WHERE prospect_id = $1', [prospectId]);
    await pool.query('DELETE FROM activity_events WHERE prospect_id = $1', [prospectId]);
    await pool.query('DELETE FROM tasks WHERE prospect_id = $1', [prospectId]);
    await pool.query('DELETE FROM prospects WHERE id = $1', [prospectId]);
    await pool.query('DELETE FROM units WHERE id = $1', [unitId]);
  });

  it('schedules a tour successfully', async () => {
    const res = await request(app).post('/tours').send({
      prospectId,
      unitId,
      scheduledAt: '2026-03-15T10:00:00.000Z',
    });
    expect(res.status).toBe(201);
    tourId = res.body.id as string;
  });

  it('rejects a tour on the same unit within 1 hour (409)', async () => {
    const res = await request(app).post('/tours').send({
      prospectId,
      unitId,
      scheduledAt: '2026-03-15T10:30:00.000Z', // 30 min after existing tour
    });
    expect(res.status).toBe(409);
  });

  it('allows a tour on the same unit outside the 1-hour window', async () => {
    const res = await request(app).post('/tours').send({
      prospectId,
      unitId,
      scheduledAt: '2026-03-15T12:00:00.000Z', // 2h after existing tour
    });
    expect(res.status).toBe(201);
  });
});
