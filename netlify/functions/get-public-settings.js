const { query } = require('../../utils/db');
const { corsHeaders } = require('../../utils/auth');

// Keys safe to expose to the public (no secrets, no passwords)
const PUBLIC_KEYS = ['venue_name', 'venue_address', 'contact_email', 'contact_phone', 'satellite_location'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  try {
    const placeholders = PUBLIC_KEYS.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `SELECT key, value FROM app_settings WHERE key IN (${placeholders})`,
      PUBLIC_KEYS
    );
    const settings = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ settings }),
    };
  } catch (err) {
    console.error('get-public-settings error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to fetch settings.' }),
    };
  }
};
