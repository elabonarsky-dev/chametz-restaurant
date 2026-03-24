const { transaction } = require('../../utils/db');
const { validateBookingInput, validateAdminBookingInput } = require('../../utils/validate');
const { verifyAdminAsync, corsHeaders } = require('../../utils/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Admin-created bookings skip Stripe and use relaxed validation
    const isAdmin = await verifyAdminAsync(event.headers);
    const errors = isAdmin ? validateAdminBookingInput(body) : validateBookingInput(body);

    if (errors.length > 0) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ errors }),
      };
    }

    // Admin bookings: no deposit, mark as confirmed, record who created it
    const stripePaymentId = isAdmin ? null : body.stripe_payment_id;
    const depositAmount   = isAdmin ? 0    : (body.deposit_amount || 0);
    const status          = 'confirmed';

    const result = await transaction(async (client) => {
      // Insert the booking record
      const bookingResult = await client.query(
        `INSERT INTO bookings
          (pickup_address, travel_time_minutes, satellite_confirmation, preferred_dates,
           status, stripe_payment_id, deposit_amount, occasion, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          body.pickup_address.trim(),
          body.travel_time_minutes || 0,
          body.satellite_confirmation || false,
          JSON.stringify(body.preferred_dates),
          status,
          stripePaymentId,
          depositAmount,
          body.occasion || null,
          body.phone || null,
          body.email || null,
        ]
      );

      const booking = bookingResult.rows[0];

      // Insert each guest
      const guests = [];
      for (let i = 0; i < body.guests.length; i++) {
        const g = body.guests[i];
        const guestResult = await client.query(
          `INSERT INTO guests (booking_id, name, birthday, beverage_pairing, allergies, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            booking.id,
            g.name.trim(),
            g.birthday,
            g.beverage_pairing,
            g.allergies || '',
            i === 0,
          ]
        );
        guests.push(guestResult.rows[0]);
      }

      return { booking, guests };
    });

    return {
      statusCode: 201,
      headers: corsHeaders(),
      body: JSON.stringify({
        message: 'Booking created successfully.',
        booking: result.booking,
        guests: result.guests,
      }),
    };
  } catch (err) {
    console.error('create-booking error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to create booking. Please try again.' }),
    };
  }
};
