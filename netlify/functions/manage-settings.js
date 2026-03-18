const { query } = require('../../utils/db');
const { verifyAdminAsync, unauthorizedResponse, corsHeaders } = require('../../utils/auth');

// Keys that are safe to expose (no password)
const PUBLIC_KEYS = ['venue_name', 'cuisine_type', 'venue_address', 'contact_email', 'contact_phone', 'reservation_limit'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  if (!await verifyAdminAsync(event.headers)) {
    return unauthorizedResponse();
  }

  if (event.httpMethod === 'GET') {
    try {
      const result = await query('SELECT key, value FROM app_settings ORDER BY key', []);
      const settings = {};
      result.rows.forEach(row => { settings[row.key] = row.value; });
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ settings }),
      };
    } catch (err) {
      console.error('manage-settings GET error:', err.message);
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to fetch settings.' }),
      };
    }
  }

  // POST — upsert one or more settings
  try {
    const body = JSON.parse(event.body || '{}');
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'settings object is required.' }),
      };
    }

    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('manage-settings POST error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to save settings.' }),
    };
  }
};
