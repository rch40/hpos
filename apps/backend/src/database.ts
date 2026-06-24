import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL ?? 'postgres://hpos:hpos@localhost:5432/hpos';

export const pool = new Pool({ connectionString });

export const closePool = async (): Promise<void> => {
  await pool.end();
};
