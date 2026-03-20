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
    const {
      id,
      status,
      email,
      phone,
      pickup_address,
      preferred_dates,
      confirmed_date,
      primary_guest,   // { id, name, birthday, beverage_pairing, allergies }
    } = body;

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Booking ID is required.' }),
      };
    }

    // ── Update bookings row ────────────────────────────────────
    const updates = [];
    const params = [];

    const validStatuses = ['pending', 'confirmed', 'cancelled', 'refunded'];
    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: `Status must be one of: ${validStatuses.join(', ')}` }),
        };
      }
      params.push(status);
      updates.push(`status = $${params.length}`);
    }

    if (email !== undefined) {
      params.push(email || null);
      updates.push(`email = $${params.length}`);
    }
    if (phone !== undefined) {
      params.push(phone || null);
      updates.push(`phone = $${params.length}`);
    }
    if (pickup_address !== undefined) {
      params.push(pickup_address || null);
      updates.push(`pickup_address = $${params.length}`);
    }
    if (preferred_dates !== undefined) {
      params.push(JSON.stringify(preferred_dates));
      updates.push(`preferred_dates = $${params.length}`);
    }
    if (confirmed_date !== undefined) {
      params.push(confirmed_date || null);
      updates.push(`confirmed_date = $${params.length}`);
    }

    let updatedBooking = null;
    if (updates.length > 0) {
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
      updatedBooking = result.rows[0];
    }

    // ── Update primary guest if provided ──────────────────────
    if (primary_guest && primary_guest.id) {
      const guestUpdates = [];
      const guestParams = [];

      if (primary_guest.name !== undefined) {
        guestParams.push(primary_guest.name);
        guestUpdates.push(`name = $${guestParams.length}`);
      }
      if (primary_guest.birthday !== undefined) {
        guestParams.push(primary_guest.birthday || null);
        guestUpdates.push(`birthday = $${guestParams.length}`);
      }
      if (primary_guest.beverage_pairing !== undefined) {
        guestParams.push(primary_guest.beverage_pairing);
        guestUpdates.push(`beverage_pairing = $${guestParams.length}`);
      }
      if (primary_guest.allergies !== undefined) {
        guestParams.push(primary_guest.allergies || '');
        guestUpdates.push(`allergies = $${guestParams.length}`);
      }

      if (guestUpdates.length > 0) {
        guestParams.push(primary_guest.id);
        await query(
          `UPDATE guests SET ${guestUpdates.join(', ')} WHERE id = $${guestParams.length}`,
          guestParams
        );
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ booking: updatedBooking || { id } }),
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
