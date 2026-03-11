const { query } = require('../../utils/db');
const { verifyAdmin, unauthorizedResponse, corsHeaders } = require('../../utils/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (!['GET', 'POST', 'PUT'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  // GET requests for available dates are public (booking form needs them)
  if (event.httpMethod === 'GET') {
    return handleGet(event);
  }

  // POST/PUT require admin auth
  if (!verifyAdmin(event.headers)) {
    return unauthorizedResponse();
  }

  if (event.httpMethod === 'POST') {
    return handleCreate(event);
  }

  return handleUpdate(event);
};

async function handleGet(event) {
  try {
    const month = event.queryStringParameters?.month;
    const year = event.queryStringParameters?.year;
    const onlyOpen = event.queryStringParameters?.only_open === 'true';

    let sql = 'SELECT * FROM available_dates';
    const params = [];
    const conditions = [];

    if (month && year) {
      params.push(parseInt(year, 10), parseInt(month, 10));
      conditions.push(`EXTRACT(YEAR FROM date) = $${params.length - 1} AND EXTRACT(MONTH FROM date) = $${params.length}`);
    }

    if (onlyOpen) {
      conditions.push('is_open = true');
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY date ASC';

    const result = await query(sql, params);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ dates: result.rows }),
    };
  } catch (err) {
    console.error('manage-dates GET error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to fetch dates.' }),
    };
  }
}

async function handleCreate(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { date, is_open, max_guests, is_special_event, notes } = body;

    if (!date) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Date is required.' }),
      };
    }

    const result = await query(
      `INSERT INTO available_dates (date, is_open, max_guests, is_special_event, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (date) DO UPDATE SET
         is_open = EXCLUDED.is_open,
         max_guests = EXCLUDED.max_guests,
         is_special_event = EXCLUDED.is_special_event,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [
        date,
        is_open !== undefined ? is_open : true,
        max_guests || 45,
        is_special_event || false,
        notes || '',
      ]
    );

    return {
      statusCode: 201,
      headers: corsHeaders(),
      body: JSON.stringify({ date: result.rows[0] }),
    };
  } catch (err) {
    console.error('manage-dates POST error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to create/update date.' }),
    };
  }
}

async function handleUpdate(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { id, is_open, max_guests, is_special_event, notes } = body;

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Date ID is required.' }),
      };
    }

    const updates = [];
    const params = [];

    if (is_open !== undefined) {
      params.push(is_open);
      updates.push(`is_open = $${params.length}`);
    }
    if (max_guests !== undefined) {
      params.push(max_guests);
      updates.push(`max_guests = $${params.length}`);
    }
    if (is_special_event !== undefined) {
      params.push(is_special_event);
      updates.push(`is_special_event = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'No fields to update.' }),
      };
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const result = await query(
      `UPDATE available_dates SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Date not found.' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ date: result.rows[0] }),
    };
  } catch (err) {
    console.error('manage-dates PUT error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to update date.' }),
    };
  }
}
