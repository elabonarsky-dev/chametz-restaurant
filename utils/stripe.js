const Stripe = require('stripe');

let stripeInstance;

function getStripe() {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  }
  return stripeInstance;
}

const DEPOSIT_PER_GUEST_CENTS = 5000; // $50.00

/**
 * Create a PaymentIntent for the reservation deposit.
 * Amount = $50 per guest.
 */
async function createPaymentIntent(guestCount, metadata = {}) {
  const amount = guestCount * DEPOSIT_PER_GUEST_CENTS;
  const stripe = getStripe();

  return stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    metadata: {
      guest_count: String(guestCount),
      ...metadata,
    },
    automatic_payment_methods: { enabled: true },
  });
}

async function retrievePaymentIntent(paymentIntentId) {
  return getStripe().paymentIntents.retrieve(paymentIntentId);
}

module.exports = { createPaymentIntent, retrievePaymentIntent, getStripe, DEPOSIT_PER_GUEST_CENTS };
