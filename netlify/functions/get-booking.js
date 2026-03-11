const { query } = require('../../utils/db');
const { verifyAdmin, unauthorizedResponse, corsHeaders } = require('../../utils/auth');

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

  if (!verifyAdmin(event.headers)) {
    return unauthorizedResponse();
  }

  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Booking ID is required.' }),
      };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invalid booking ID format.' }),
      };
    }

    const bookingResult = await query('SELECT * FROM bookings WHERE id = $1', [id]);

    if (bookingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Booking not found.' }),
      };
    }

    const guestsResult = await query(
      'SELECT * FROM guests WHERE booking_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [id]
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        booking: bookingResult.rows[0],
        guests: guestsResult.rows,
      }),
    };
  } catch (err) {
    console.error('get-booking error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to fetch booking details.' }),
    };
  }
};
