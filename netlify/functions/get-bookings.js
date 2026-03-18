const { query } = require('../../utils/db');
const { verifyAdminAsync, unauthorizedResponse, corsHeaders } = require('../../utils/auth');

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

  if (!await verifyAdminAsync(event.headers)) {
    return unauthorizedResponse();
  }

  try {
    const page = Math.max(1, parseInt(event.queryStringParameters?.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(event.queryStringParameters?.limit || '10', 10)));
    const offset = (page - 1) * limit;
    const search = event.queryStringParameters?.search || '';
    const status = event.queryStringParameters?.status || '';

    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` WHERE (b.pickup_address ILIKE $${params.length} OR b.id::text ILIKE $${params.length} OR b.email ILIKE $${params.length})`;
    }

    if (status) {
      if (whereClause) {
        params.push(status);
        whereClause += ` AND b.status = $${params.length}`;
      } else {
        params.push(status);
        whereClause += ` WHERE b.status = $${params.length}`;
      }
    }

    const countResult = await query(`SELECT COUNT(*) FROM bookings b${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const bookingsResult = await query(
      `SELECT b.*, 
        (SELECT COUNT(*) FROM guests g WHERE g.booking_id = b.id) as guest_count,
        (SELECT g.name FROM guests g WHERE g.booking_id = b.id AND g.is_primary = true LIMIT 1) as primary_guest
       FROM bookings b${whereClause}
       ORDER BY b.created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        bookings: bookingsResult.rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      }),
    };
  } catch (err) {
    console.error('get-bookings error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to fetch bookings.' }),
    };
  }
};
