CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE unit_status AS ENUM ('available', 'held', 'leased');
CREATE TYPE pipeline_status AS ENUM (
  'new',
  'contacted',
  'tour_scheduled',
  'toured',
  'application',
  'leased',
  'lost'
);
CREATE TYPE task_state AS ENUM ('open', 'done');
CREATE TYPE activity_event_type AS ENUM (
  'prospect_created',
  'prospect_status_changed',
  'task_created',
  'task_closed',
  'tour_scheduled',
  'tour_outcome_recorded',
  'unit_status_changed'
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status unit_status NOT NULL DEFAULT 'available'
);

CREATE TABLE prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  assigned_unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  status pipeline_status NOT NULL DEFAULT 'new',
  assignee text NOT NULL
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  due_date timestamptz NOT NULL,
  assignee text NOT NULL,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  state task_state NOT NULL DEFAULT 'open'
);

CREATE TABLE activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type activity_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  summary text NOT NULL
);

CREATE INDEX tasks_prospect_id_idx ON tasks(prospect_id);
CREATE INDEX activity_events_prospect_id_idx ON activity_events(prospect_id);
CREATE INDEX prospects_status_idx ON prospects(status);

INSERT INTO units (id, name, status)
VALUES
  ('9d85023e-41fe-4d96-a36b-b071d45f9c02', 'Unit 101', 'available'),
  ('5c7425f8-e7b5-44bf-83cd-54a63feb6817', 'Unit 203', 'held')
ON CONFLICT (id) DO NOTHING;

INSERT INTO prospects (id, name, email, phone, assigned_unit_id, status, assignee)
VALUES (
  '7b0644d7-5a60-470f-8159-4529c49f3a9d',
  'Jamie Rivera',
  'jamie@example.com',
  '5551234567',
  '5c7425f8-e7b5-44bf-83cd-54a63feb6817',
  'new',
  'Leasing Team'
)
ON CONFLICT (id) DO NOTHING;
