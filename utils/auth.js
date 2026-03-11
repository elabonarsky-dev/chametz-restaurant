/**
 * Validate the admin Authorization header against ADMIN_SECRET.
 * Expected format: "Bearer <token>"
 */
function verifyAdmin(headers) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SECRET environment variable is not configured.');
  }

  const authHeader = headers.authorization || headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || token !== secret) {
    return false;
  }
  return true;
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

module.exports = { verifyAdmin, unauthorizedResponse, corsHeaders };
