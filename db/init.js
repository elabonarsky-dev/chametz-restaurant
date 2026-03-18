require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getDbConfig() {
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL is not set');
  const parsed = new URL(url);
  const password = decodeURIComponent(parsed.password || '').trim();
  const config = {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432', 10),
    database: (parsed.pathname.slice(1) || 'postgres').replace(/\/.*$/, '') || 'postgres',
    user: decodeURIComponent(parsed.username || ''),
    password,
    ssl: { rejectUnauthorized: false },
  };
  console.log('Connecting to:', config.host + ':' + config.port, 'user:', config.user, 'database:', config.database);
  return config;
}

async function initializeDatabase() {
  const config = getDbConfig();
  const pool = new Pool(config);

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
