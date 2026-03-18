const { query } = require('../../utils/db');
const { verifyAdminAsync, unauthorizedResponse, corsHeaders } = require('../../utils/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  if (!await verifyAdminAsync(event.headers)) {
    return unauthorizedResponse();
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, status } = body;

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Booking ID is required.' }),
      };
    }

    const validStatuses = ['pending', 'confirmed', 'cancelled', 'refunded'];
    if (status && !validStatuses.includes(status)) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: `Status must be one of: ${validStatuses.join(', ')}` }),
      };
    }

    const updates = [];
    const params = [];

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
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
      `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Booking not found.' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ booking: result.rows[0] }),
    };
  } catch (err) {
    console.error('update-booking error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to update booking.' }),
    };
  }
};
