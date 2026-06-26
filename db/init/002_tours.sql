CREATE TYPE tour_outcome AS ENUM ('completed', 'no_show', 'cancelled');

CREATE TABLE tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id),
  scheduled_at timestamptz NOT NULL,
  outcome tour_outcome
);

CREATE INDEX tours_prospect_id_idx ON tours(prospect_id);
CREATE INDEX tours_unit_id_idx ON tours(unit_id);
