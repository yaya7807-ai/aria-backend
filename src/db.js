const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway / Supabase / Neon biasanya butuh SSL -> set DB_SSL=true di .env
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[DB] koneksi idle error:', err.message);
});

module.exports = pool;
