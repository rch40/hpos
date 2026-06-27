import { describe, it, expect } from 'vitest';
import { applyStatusRules } from '../rules.js';
import type { Prospect, Task, Unit } from '@hpos/contracts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const prospect = (overrides: Partial<Prospect> = {}): Prospect => ({
  id: 'p-1',
  name: 'Jamie Rivera',
  contact: { email: 'jamie@example.com', phone: '5551234567' },
  assignedUnitId: null,
  status: 'new',
  assignee: 'Agent A',
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't-1',
  title: 'Some task',
  dueDate: new Date().toISOString(),
  assignee: 'Agent A',
  prospectId: 'p-1',
  state: 'open',
  ...overrides,
});

const unit = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'u-1',
  name: 'Unit 101',
  status: 'available',
  ...overrides,
});

const now = new Date('2026-01-15T12:00:00Z');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const run = (
  status: Prospect['status'],
  p = prospect(),
  openTasks: Task[] = [],
  units: Unit[] = [],
  tourScheduledAt?: Date
) => applyStatusRules(status, { prospect: p, openTasks, units, now, tourScheduledAt });

// ─── contacted ───────────────────────────────────────────────────────────────

describe('contacted', () => {
  it('creates a send-availability task due in 2 days', () => {
    const result = run('contacted');
    expect(result.tasksToCreate).toHaveLength(1);
    const t = result.tasksToCreate[0]!;
    expect(t.title).toContain('Send tour availability');
    expect(t.title).toContain('Jamie Rivera');
    const due = new Date(t.dueDate);
    expect(due.toISOString()).toBe(new Date('2026-01-17T12:00:00Z').toISOString());
  });

  it('closes no tasks and makes no unit changes', () => {
    const result = run('contacted');
    expect(result.taskIdsToClose).toHaveLength(0);
    expect(result.unitUpdates).toHaveLength(0);
  });
});

// ─── tour_scheduled ──────────────────────────────────────────────────────────

describe('tour_scheduled', () => {
  it('creates confirm-tour task due 24h before the scheduled tour', () => {
    const tourScheduledAt = new Date('2026-01-20T14:00:00Z');
    const result = run('tour_scheduled', prospect(), [], [], tourScheduledAt);
    expect(result.tasksToCreate).toHaveLength(1);
    const t = result.tasksToCreate[0]!;
    expect(t.title).toContain('Confirm tour 24h prior');
    expect(new Date(t.dueDate).toISOString()).toBe('2026-01-19T14:00:00.000Z');
  });

  it('falls back to +1 day from now when no tour time provided', () => {
    const result = run('tour_scheduled');
    const t = result.tasksToCreate[0]!;
    expect(new Date(t.dueDate).toISOString()).toBe(new Date('2026-01-16T12:00:00Z').toISOString());
  });
});

// ─── toured ──────────────────────────────────────────────────────────────────

describe('toured', () => {
  it('creates a send-application-link task due +1 day', () => {
    const result = run('toured');
    expect(result.tasksToCreate).toHaveLength(1);
    expect(result.tasksToCreate[0]!.title).toBe('Send application link');
    expect(new Date(result.tasksToCreate[0]!.dueDate).toISOString()).toBe(
      new Date('2026-01-16T12:00:00Z').toISOString()
    );
  });
});

// ─── application ─────────────────────────────────────────────────────────────

describe('application', () => {
  it('creates a review-application task due +3 days', () => {
    const result = run('application');
    expect(result.tasksToCreate).toHaveLength(1);
    expect(result.tasksToCreate[0]!.title).toBe('Review application');
    expect(new Date(result.tasksToCreate[0]!.dueDate).toISOString()).toBe(
      new Date('2026-01-18T12:00:00Z').toISOString()
    );
  });
});

// ─── leased ──────────────────────────────────────────────────────────────────

describe('leased', () => {
  it('closes all open tasks', () => {
    const openTasks = [task({ id: 't-1' }), task({ id: 't-2' })];
    const result = run('leased', prospect(), openTasks);
    expect(result.taskIdsToClose).toEqual(expect.arrayContaining(['t-1', 't-2']));
  });

  it('marks the assigned unit as leased', () => {
    const p = prospect({ assignedUnitId: 'u-1' });
    const result = run('leased', p);
    expect(result.unitUpdates).toEqual([{ id: 'u-1', status: 'leased' }]);
  });

  it('makes no unit changes when prospect has no assigned unit', () => {
    const result = run('leased', prospect({ assignedUnitId: null }));
    expect(result.unitUpdates).toHaveLength(0);
  });

  it('does not close already-done tasks', () => {
    const openTasks = [task({ id: 't-1', state: 'done' })];
    const result = run('leased', prospect(), openTasks);
    expect(result.taskIdsToClose).toHaveLength(0);
  });

  it('creates no new tasks', () => {
    const result = run('leased');
    expect(result.tasksToCreate).toHaveLength(0);
  });
});

// ─── lost ────────────────────────────────────────────────────────────────────

describe('lost', () => {
  it('closes all open tasks', () => {
    const openTasks = [task({ id: 't-1' }), task({ id: 't-2' }), task({ id: 't-3', state: 'done' })];
    const result = run('lost', prospect(), openTasks);
    expect(result.taskIdsToClose).toEqual(expect.arrayContaining(['t-1', 't-2']));
    expect(result.taskIdsToClose).not.toContain('t-3');
  });

  it('makes no unit changes and creates no tasks', () => {
    const result = run('lost');
    expect(result.unitUpdates).toHaveLength(0);
    expect(result.tasksToCreate).toHaveLength(0);
  });
});

// ─── Activity events ─────────────────────────────────────────────────────────

describe('activity event', () => {
  it('always appends a prospect_status_changed event', () => {
    for (const status of ['contacted', 'toured', 'lost', 'leased'] as const) {
      const result = run(status);
      const ev = result.events.find((e) => e.type === 'prospect_status_changed');
      expect(ev).toBeDefined();
      expect(ev!.prospectId).toBe('p-1');
      expect(ev!.summary).toContain(status.replace(/_/g, ' '));
    }
  });

  it('includes the assigned unit id in the event', () => {
    const p = prospect({ assignedUnitId: 'u-1' });
    const result = run('contacted', p);
    const ev = result.events.find((e) => e.type === 'prospect_status_changed');
    expect(ev!.unitId).toBe('u-1');
  });
});

// ─── Unknown status ──────────────────────────────────────────────────────────

describe('unknown status', () => {
  it('returns empty result (only the status-changed event) for unrecognised status', () => {
    // "new" has no rule — no tasks, no closes, no unit updates
    const result = run('new');
    expect(result.tasksToCreate).toHaveLength(0);
    expect(result.taskIdsToClose).toHaveLength(0);
    expect(result.unitUpdates).toHaveLength(0);
    expect(result.events).toHaveLength(1);
  });
});
