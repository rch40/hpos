/// <reference types="vite/client" />
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import type {
  ActivityEvent,
  PipelineStatus,
  Prospect,
  Task,
  Unit,
  UnitStatus,
} from '@hpos/contracts';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const fetchProspects = () => apiFetch<Prospect[]>('/prospects');
const fetchTasks    = () => apiFetch<Task[]>('/tasks');
const fetchUnits    = () => apiFetch<Unit[]>('/units');

type ProspectDetail = {
  prospect: Prospect;
  tasks: Task[];
  activityEvents: ActivityEvent[];
};

const fetchProspectDetail = (id: string) =>
  apiFetch<ProspectDetail>(`/prospects/${id}`);

const patchProspectStatus = (id: string, status: PipelineStatus) =>
  apiFetch<{ prospect: Prospect }>(`/prospects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

type UpdateProspectPayload = Partial<{
  name: string;
  contact: { email: string; phone: string };
  assignee: string;
  assignedUnitId: string | null;
}>;

const patchProspect = (id: string, payload: UpdateProspectPayload) =>
  apiFetch<Prospect>(`/prospects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

const deleteProspect = (id: string) =>
  apiFetch<void>(`/prospects/${id}`, { method: 'DELETE' });

const patchTaskState = (id: string, state: Task['state']) =>
  apiFetch<Task>(`/tasks/${id}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  });

type CreateProspectPayload = {
  name: string;
  contact: { email: string; phone: string };
  assignee: string;
  assignedUnitId?: string | null;
};

const postProspect = (payload: CreateProspectPayload) =>
  apiFetch<Prospect>('/prospects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

const postUnit = (payload: { name: string; status: UnitStatus }) =>
  apiFetch<Unit>('/units', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

const deleteUnit = (id: string) =>
  apiFetch<void>(`/units/${id}`, { method: 'DELETE' });

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_STATUSES: PipelineStatus[] = [
  'new',
  'contacted',
  'tour_scheduled',
  'toured',
  'application',
  'leased',
  'lost',
];

const STATUS_COLORS: Record<PipelineStatus, string> = {
  new: 'bg-zinc-100 text-zinc-700',
  contacted: 'bg-sky-100 text-sky-700',
  tour_scheduled: 'bg-violet-100 text-violet-700',
  toured: 'bg-amber-100 text-amber-700',
  application: 'bg-orange-100 text-orange-700',
  leased: 'bg-teal-100 text-teal-700',
  lost: 'bg-red-100 text-red-600',
};

const EVENT_ICONS: Record<ActivityEvent['type'], string> = {
  prospect_created: '✦',
  prospect_status_changed: '→',
  task_created: '＋',
  task_closed: '✓',
  tour_scheduled: '📅',
  tour_outcome_recorded: '📋',
  unit_status_changed: '🏠',
};

// ─── Small UI atoms ──────────────────────────────────────────────────────────

const Badge = ({ status }: { status: PipelineStatus }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
  >
    {status.replace(/_/g, ' ')}
  </span>
);

const Spinner = () => (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
);

const EmptyState = ({ message }: { message: string }) => (
  <p className="px-4 py-6 text-center text-sm text-zinc-400">{message}</p>
);

// ─── Prospect Detail Panel ───────────────────────────────────────────────────

function ProspectDetailPanel({
  prospectId,
  onTaskUpdated,
}: {
  prospectId: string;
  onTaskUpdated: () => void;
}) {
  const [detail, setDetail] = useState<ProspectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [closingTaskId, setClosingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchProspectDetail(prospectId);
      setDetail(d);
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkDone = async (taskId: string) => {
    setClosingTaskId(taskId);
    try {
      await patchTaskState(taskId, 'done');
      await load();
      onTaskUpdated();
    } finally {
      setClosingTaskId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!detail) return null;

  const { prospect, tasks, activityEvents } = detail;
  const openTasks = tasks.filter((t) => t.state === 'open');
  const doneTasks = tasks.filter((t) => t.state === 'done');

  return (
    <div className="flex flex-col gap-6">
      {/* Contact info */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Contact
        </h3>
        <dl className="grid gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-12 shrink-0 text-zinc-400">Email</dt>
            <dd className="text-zinc-800">{prospect.contact.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-12 shrink-0 text-zinc-400">Phone</dt>
            <dd className="text-zinc-800">{prospect.contact.phone}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-12 shrink-0 text-zinc-400">Owner</dt>
            <dd className="text-zinc-800">{prospect.assignee}</dd>
          </div>
        </dl>
      </section>

      {/* Open tasks */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Open Tasks ({openTasks.length})
        </h3>
        {openTasks.length === 0 ? (
          <EmptyState message="No open tasks" />
        ) : (
          <ul className="flex flex-col gap-2">
            {openTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5"
              >
                <button
                  onClick={() => void handleMarkDone(task.id)}
                  disabled={closingTaskId === task.id}
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 hover:border-teal-500 disabled:opacity-50"
                  title="Mark done"
                >
                  {closingTaskId === task.id && (
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800">{task.title}</p>
                  <p className="text-xs text-zinc-400">
                    Due {new Date(task.dueDate).toLocaleDateString()} · {task.assignee}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Done tasks (collapsed) */}
      {doneTasks.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Completed ({doneTasks.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {doneTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 px-3 py-1.5 text-sm text-zinc-400 line-through"
              >
                <span className="text-teal-400">✓</span>
                {task.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Activity timeline */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Activity Timeline
        </h3>
        {activityEvents.length === 0 ? (
          <EmptyState message="No activity yet" />
        ) : (
          <ol className="relative border-l border-zinc-200 pl-5">
            {activityEvents.map((event) => (
              <li key={event.id} className="mb-4 last:mb-0">
                <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs ring-1 ring-zinc-200">
                  {EVENT_ICONS[event.type] ?? '•'}
                </span>
                <p className="text-sm text-zinc-800">{event.summary}</p>
                <time className="text-xs text-zinc-400">
                  {new Date(event.timestamp).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

const UNIT_STATUS_COLORS: Record<UnitStatus, string> = {
  available: 'bg-teal-100 text-teal-700',
  held:      'bg-amber-100 text-amber-700',
  leased:    'bg-zinc-100 text-zinc-500',
};

// ─── Units Panel ─────────────────────────────────────────────────────────────

function UnitsPanel({
  units,
  loading,
  onUnitsChanged,
}: {
  units: Unit[];
  loading: boolean;
  onUnitsChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async () => {
    setFormError(null);
    if (!newName.trim()) { setFormError('Name is required.'); return; }
    setSubmitting(true);
    try {
      await postUnit({ name: newName.trim(), status: 'available' });
      setNewName('');
      setShowForm(false);
      onUnitsChanged();
    } catch {
      setFormError('Failed to create unit.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteUnit(id);
      onUnitsChanged();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold">Units</h2>
        <div className="flex items-center gap-3">
          {loading && <Spinner />}
          <button
            onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700"
          >
            {showForm ? '✕ Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {units.length === 0 && !loading ? (
        <EmptyState message="No units yet" />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {units.map((unit) => (
            <li key={unit.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800">{unit.name}</p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${UNIT_STATUS_COLORS[unit.status]}`}>
                {unit.status}
              </span>
              <button
                onClick={() => void handleDelete(unit.id)}
                disabled={deletingId === unit.id}
                className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-40"
                title="Delete unit"
              >
                {deletingId === unit.id ? <Spinner /> : '✕'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-4">
          {formError && (
            <p className="mb-2 text-xs text-red-600">{formError}</p>
          )}
          <div className="flex gap-2">
            <input
              className="h-9 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Unit 101"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
            />
            <button
              onClick={() => void handleCreate()}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? <Spinner /> : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Prospect Form ───────────────────────────────────────────────────────

function EditProspectForm({
  prospect,
  units,
  onSaved,
  onDeleted,
  onCancel,
}: {
  prospect: Prospect;
  units: Unit[];
  onSaved: (updated: Prospect) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState({
    name:           prospect.name,
    email:          prospect.contact.email,
    phone:          prospect.contact.phone,
    assignee:       prospect.assignee,
    assignedUnitId: prospect.assignedUnitId ?? '',
  });
  const [submitting, setSubmitting]   = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  const set = (key: keyof typeof fields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    setFormError(null);
    if (fields.name.trim().length < 2) { setFormError('Name must be at least 2 characters.'); return; }
    if (!fields.email.includes('@'))   { setFormError('Enter a valid email address.'); return; }
    if (fields.phone.replace(/\D/g, '').length < 10) { setFormError('Phone must be at least 10 digits.'); return; }
    if (!fields.assignee.trim())       { setFormError('Assignee is required.'); return; }

    setSubmitting(true);
    try {
      const updated = await patchProspect(prospect.id, {
        name:     fields.name.trim(),
        contact:  { email: fields.email.trim(), phone: fields.phone.trim() },
        assignee: fields.assignee.trim(),
        assignedUnitId: fields.assignedUnitId || null,
      });
      onSaved(updated);
    } catch {
      setFormError('Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProspect(prospect.id);
      onDeleted();
    } catch {
      setFormError('Failed to delete prospect.');
      setDeleting(false);
      setConfirming(false);
    }
  };

  const availableUnits = units.filter(
    (u) => u.status === 'available' || u.id === prospect.assignedUnitId
  );

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-200">
          {formError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Full name</label>
          <input
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={fields.name}
            onChange={set('name')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Assignee</label>
          <input
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={fields.assignee}
            onChange={set('assignee')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Email</label>
          <input
            type="email"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={fields.email}
            onChange={set('email')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Phone</label>
          <input
            type="tel"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={fields.phone}
            onChange={set('phone')}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-medium text-zinc-500">Assigned unit</label>
          <select
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={fields.assignedUnitId}
            onChange={set('assignedUnitId')}
          >
            <option value="">— None —</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={submitting}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {submitting && <Spinner />}
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            Cancel
          </button>
        </div>

        {/* Delete with inline confirm */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Delete prospect
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Are you sure?</span>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              {deleting ? <Spinner /> : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Prospect Form ────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', email: '', phone: '', assignee: '', assignedUnitId: '' };

function CreateProspectForm({
  units,
  onCreated,
  onCancel,
}: {
  units: Unit[];
  onCreated: (prospect: Prospect) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async () => {
    setFormError(null);
    if (!fields.name.trim() || fields.name.trim().length < 2) {
      setFormError('Name must be at least 2 characters.');
      return;
    }
    if (!fields.email.includes('@')) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (fields.phone.replace(/\D/g, '').length < 10) {
      setFormError('Phone must be at least 10 digits.');
      return;
    }
    if (!fields.assignee.trim()) {
      setFormError('Assignee is required.');
      return;
    }

    setSubmitting(true);
    try {
      const prospect = await postProspect({
        name: fields.name.trim(),
        contact: { email: fields.email.trim(), phone: fields.phone.trim() },
        assignee: fields.assignee.trim(),
        assignedUnitId: fields.assignedUnitId || null,
      });
      onCreated(prospect);
      setFields(EMPTY_FORM);
    } catch {
      setFormError('Failed to create prospect. Check the backend.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700">New Prospect</h3>
      {formError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-200">
          {formError}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Full name</label>
          <input
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Jamie Rivera"
            value={fields.name}
            onChange={set('name')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Assignee</label>
          <input
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Leasing Team"
            value={fields.assignee}
            onChange={set('assignee')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Email</label>
          <input
            type="email"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="jamie@example.com"
            value={fields.email}
            onChange={set('email')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Phone</label>
          <input
            type="tel"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="5551234567"
            value={fields.phone}
            onChange={set('phone')}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-medium text-zinc-500">Assigned unit (optional)</label>
          <select
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={fields.assignedUnitId}
            onChange={set('assignedUnitId')}
          >
            <option value="">— None —</option>
            {units.filter((u) => u.status === 'available').map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {submitting && <Spinner />}
          {submitting ? 'Saving…' : 'Add prospect'}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Tasks Panel (global) ────────────────────────────────────────────────────

function TasksPanel({
  tasks,
  loading,
  onMarkDone,
}: {
  tasks: Task[];
  loading: boolean;
  onMarkDone: (id: string) => Promise<void>;
}) {
  const [closingId, setClosingId] = useState<string | null>(null);
  const openTasks = tasks.filter((t) => t.state === 'open');

  const handle = async (id: string) => {
    setClosingId(id);
    try {
      await onMarkDone(id);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <aside className="rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold">Open Tasks</h2>
        {loading ? (
          <Spinner />
        ) : (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {openTasks.length}
          </span>
        )}
      </div>
      {openTasks.length === 0 && !loading ? (
        <EmptyState message="All tasks complete" />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-start gap-3 px-4 py-3">
              <button
                onClick={() => void handle(task.id)}
                disabled={closingId === task.id}
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 hover:border-teal-500 disabled:opacity-50"
                title="Mark done"
              >
                {closingId === task.id && (
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800">{task.title}</p>
                <p className="text-xs text-zinc-400">
                  Due {new Date(task.dueDate).toLocaleDateString()} · {task.assignee}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

const App = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [units,     setUnits]     = useState<Unit[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(true);
  const [tasksLoading,     setTasksLoading]     = useState(true);
  const [unitsLoading,     setUnitsLoading]     = useState(true);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [editingProspectId,  setEditingProspectId]  = useState<string | null>(null);
  const [updatingStatusId,   setUpdatingStatusId]   = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const loadProspects = useCallback(async () => {
    setProspectsLoading(true);
    try {
      setProspects(await fetchProspects());
    } catch {
      setError('Failed to load prospects. Is the backend running?');
    } finally {
      setProspectsLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      setTasks(await fetchTasks());
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadUnits = useCallback(async () => {
    setUnitsLoading(true);
    try {
      setUnits(await fetchUnits());
    } finally {
      setUnitsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProspects();
    void loadTasks();
    void loadUnits();
  }, [loadProspects, loadTasks, loadUnits]);

  const handleStatusChange = async (
    prospectId: string,
    status: PipelineStatus
  ) => {
    setUpdatingStatusId(prospectId);
    try {
      const result = await patchProspectStatus(prospectId, status);
      setProspects((prev) =>
        prev.map((p) => (p.id === prospectId ? result.prospect : p))
      );
      await Promise.all([loadTasks(), loadUnits()]);
      if (selectedProspectId === prospectId) {
        setDetailRefreshKey((k) => k + 1);
      }
    } catch {
      setError('Failed to update status');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleMarkTaskDone = async (taskId: string) => {
    await patchTaskState(taskId, 'done');
    await loadTasks();
    if (selectedProspectId) {
      setDetailRefreshKey((k) => k + 1);
    }
  };

  const handleProspectCreated = (prospect: Prospect) => {
    setProspects((prev) => [...prev, prospect].sort((a, b) => a.name.localeCompare(b.name)));
    setShowCreateForm(false);
    setSelectedProspectId(prospect.id);
    void loadUnits(); // unit may now be assigned/held
  };

  const handleProspectSaved = (updated: Prospect) => {
    setProspects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingProspectId(null);
    setDetailRefreshKey((k) => k + 1);
    void loadUnits();
  };

  const handleProspectDeleted = () => {
    setProspects((prev) => prev.filter((p) => p.id !== selectedProspectId));
    setSelectedProspectId(null);
    setEditingProspectId(null);
    void loadTasks();
    void loadUnits();
  };

  const selectedProspect = prospects.find((p) => p.id === selectedProspectId);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            HP Labs Assessment
          </p>
          <h1 className="text-3xl font-semibold">Leasing CRM</h1>
        </header>

        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}{' '}
            <button
              className="font-semibold underline"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* ── Left column: Prospects + detail ── */}
          <div className="flex flex-col gap-4">
            {/* Prospects list */}
            <div className="rounded-md border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <h2 className="text-lg font-semibold">Prospects</h2>
                <div className="flex items-center gap-3">
                  {prospectsLoading && <Spinner />}
                  <button
                    onClick={() => setShowCreateForm((v) => !v)}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700"
                  >
                    {showCreateForm ? '✕ Cancel' : '+ Add'}
                  </button>
                </div>
              </div>

              {prospects.length === 0 && !prospectsLoading ? (
                <EmptyState message="No prospects yet" />
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {prospects.map((prospect) => (
                    <li key={prospect.id}>
                      <article
                        className={`grid cursor-pointer gap-3 px-4 py-4 transition-colors sm:grid-cols-[1fr_auto] ${
                          selectedProspectId === prospect.id
                            ? 'bg-teal-50'
                            : 'hover:bg-zinc-50'
                        }`}
                        onClick={() =>
                          setSelectedProspectId(
                            selectedProspectId === prospect.id ? null : prospect.id
                          )
                        }
                      >
                        <div className="min-w-0">
                          <h3 className="font-medium">{prospect.name}</h3>
                          <p className="text-sm text-zinc-500">
                            {prospect.contact.email}
                          </p>
                          <div className="mt-1">
                            <Badge status={prospect.status} />
                          </div>
                        </div>

                        <div
                          className="flex items-start"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {updatingStatusId === prospect.id ? (
                            <div className="flex h-10 w-44 items-center justify-center">
                              <Spinner />
                            </div>
                          ) : (
                            <select
                              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                              value={prospect.status}
                              onChange={(e) =>
                                void handleStatusChange(
                                  prospect.id,
                                  e.target.value as PipelineStatus
                                )
                              }
                            >
                              {PIPELINE_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}

              {showCreateForm && (
                <CreateProspectForm
                  units={units}
                  onCreated={handleProspectCreated}
                  onCancel={() => setShowCreateForm(false)}
                />
              )}
            </div>

            {/* Detail panel */}
            {selectedProspect && (
              <div className="rounded-md border border-teal-200 bg-white">
                <div className="flex items-center justify-between border-b border-teal-200 bg-teal-50 px-4 py-3">
                  <h2 className="text-base font-semibold text-teal-900">
                    {selectedProspect.name}
                  </h2>
                  <div className="flex items-center gap-3">
                    <button
                      className="text-xs text-teal-600 hover:underline"
                      onClick={() => setEditingProspectId(
                        editingProspectId === selectedProspect.id ? null : selectedProspect.id
                      )}
                    >
                      {editingProspectId === selectedProspect.id ? 'Cancel edit' : 'Edit'}
                    </button>
                    <button
                      className="text-xs text-teal-600 hover:underline"
                      onClick={() => { setSelectedProspectId(null); setEditingProspectId(null); }}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="px-4 py-4">
                  {editingProspectId === selectedProspect.id ? (
                    <EditProspectForm
                      prospect={selectedProspect}
                      units={units}
                      onSaved={handleProspectSaved}
                      onDeleted={handleProspectDeleted}
                      onCancel={() => setEditingProspectId(null)}
                    />
                  ) : (
                    <ProspectDetailPanel
                      key={`${selectedProspect.id}-${detailRefreshKey}`}
                      prospectId={selectedProspect.id}
                      onTaskUpdated={loadTasks}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: Units + Tasks ── */}
          <div className="flex flex-col gap-4">
            <UnitsPanel
              units={units}
              loading={unitsLoading}
              onUnitsChanged={loadUnits}
            />
            <TasksPanel
              tasks={tasks}
              loading={tasksLoading}
              onMarkDone={handleMarkTaskDone}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);