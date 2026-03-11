const { query } = require('../../utils/db');
const { corsHeaders } = require('../../utils/auth');

/**
 * Public endpoint: returns open dates for the booking calendar.
 * No admin auth required — guests need to see which dates are available.
 */
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
    const month = parseInt(event.queryStringParameters?.month || '0', 10);
    const year = parseInt(event.queryStringParameters?.year || '0', 10);

    let sql = 'SELECT date, is_open FROM available_dates WHERE is_open = true';
    const params = [];

    if (month > 0 && year > 0) {
      params.push(year, month);
      sql += ` AND EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2`;
    }

    sql += ' ORDER BY date ASC';

    const result = await query(sql, params);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ dates: result.rows.map((r) => r.date) }),
    };
  } catch (err) {
    console.error('get-available-dates error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to fetch available dates.' }),
    };
  }
};
