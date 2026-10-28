/**
 * Menjalankan semua file .sql di folder migrations/ secara berurutan.
 * File yang sudah pernah dijalankan dicatat di tabel schema_migrations,
 * jadi aman dijalankan berkali-kali:  npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

(async () => {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY, run_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const done = new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));

    for (const f of files) {
      if (done.has(f)) { console.log(`- lewati ${f} (sudah jalan)`); continue; }
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
        await client.query('COMMIT');
        console.log(`✓ ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`${f} gagal: ${e.message}`);
      }
    }
    console.log('Migration selesai.');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
