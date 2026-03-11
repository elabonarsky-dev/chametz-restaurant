const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
