const { createPaymentIntent, DEPOSIT_PER_GUEST_CENTS } = require('../../utils/stripe');
const { corsHeaders } = require('../../utils/auth');

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
    const { guest_count } = JSON.parse(event.body || '{}');

    if (!guest_count || typeof guest_count !== 'number' || guest_count < 1 || guest_count > 20) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Guest count must be between 1 and 20.' }),
      };
    }

    const intent = await createPaymentIntent(guest_count);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
        amount: intent.amount,
        deposit_per_guest: DEPOSIT_PER_GUEST_CENTS,
      }),
    };
  } catch (err) {
    console.error('create-payment-intent error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to create payment intent.' }),
    };
  }
};
