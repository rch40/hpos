import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pool } from './database.js';

// dev: cwd = apps/backend (npm workspace); prod: cwd = repo root
const candidates = [join(process.cwd(), 'db/init'), join(process.cwd(), '../../db/init')];
const migrationsDir: string = candidates.find((d) => existsSync(d)) ?? candidates[0]!

export const migrate = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations');
    const applied = new Set(rows.map((r) => r.name));

    // If _migrations is empty but the schema already exists (e.g. seeded by Docker init scripts),
    // record all migration files as applied without re-running them.
    if (applied.size === 0) {
      const { rows: tableCheck } = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'units'
         ) AS exists`
      );
      if (tableCheck[0]?.exists) {
        console.log('Schema already exists — seeding migration history.');
        for (const file of files) {
          await client.query(
            'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        }
        return;
      }
    }

    for (const file of files) {
      if (applied.has(file)) continue;

      console.log(`Applying migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
};
