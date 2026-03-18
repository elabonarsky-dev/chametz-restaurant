const { query } = require('./db');

/**
 * Sync auth check — env var only.
 * Still used as fast-path before DB lookup.
 */
function verifyAdmin(headers) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SECRET environment variable is not configured.');
  }
  const authHeader = headers.authorization || headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return !!(token && token === secret);
}

/**
 * Async auth check — first tries the env var (fast path),
 * then falls back to the DB-stored admin_password (set via Settings page).
 * All admin handlers use this so the in-app password change actually works.
 */
async function verifyAdminAsync(headers) {
  const envSecret = process.env.ADMIN_SECRET || '';
  const authHeader = headers.authorization || headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return false;

  // Fast path: matches the env var
  if (envSecret && token === envSecret) return true;

  // Slow path: check DB-stored password (admin may have changed it via Settings)
  try {
    const result = await query(
      "SELECT value FROM app_settings WHERE key = 'admin_password' LIMIT 1",
      []
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      return token === result.rows[0].value;
    }
  } catch (_) { /* DB unavailable — only env var auth works */ }

  return false;
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: corsHeaders(),
    body: JSON.stringify({ error: 'Unauthorized. Valid admin credentials required.' }),
  };
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

module.exports = { verifyAdmin, verifyAdminAsync, unauthorizedResponse, corsHeaders };
