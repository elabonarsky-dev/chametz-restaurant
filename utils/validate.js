/**
 * Validate guest age against beverage pairing.
 * Guests under 21 cannot select alcoholic pairing.
 */
function validateGuestAge(birthday, beveragePairing) {
  const dob = new Date(birthday);
  if (isNaN(dob.getTime())) {
    return { valid: false, message: 'Invalid date of birth.' };
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 0 || age > 150) {
    return { valid: false, message: 'Date of birth is not realistic.' };
  }

  if (beveragePairing === 'alcoholic' && age < 21) {
    return { valid: false, message: `Guest must be 21 or older for alcoholic beverage pairing. Current age: ${age}.` };
  }

  return { valid: true, age };
}

function validateBookingInput(body) {
  const errors = [];

  if (!body.pickup_address || typeof body.pickup_address !== 'string' || body.pickup_address.trim().length < 5) {
    errors.push('A valid pickup address is required.');
  }

  if (!Array.isArray(body.preferred_dates) || body.preferred_dates.length === 0) {
    errors.push('Please select at least one preferred dining date.');
  }

  if (!Array.isArray(body.guests) || body.guests.length === 0) {
    errors.push('At least one guest is required.');
  }

  if (body.guests && Array.isArray(body.guests)) {
    body.guests.forEach((guest, i) => {
      if (!guest.name || guest.name.trim().length < 2) {
        errors.push(`Guest ${i + 1}: Name is required (minimum 2 characters).`);
      }
      if (!guest.birthday) {
        errors.push(`Guest ${i + 1}: Date of birth is required.`);
      }
      if (!['alcoholic', 'non-alcoholic'].includes(guest.beverage_pairing)) {
        errors.push(`Guest ${i + 1}: Beverage pairing must be "alcoholic" or "non-alcoholic".`);
      }
      if (guest.birthday && guest.beverage_pairing) {
        const ageCheck = validateGuestAge(guest.birthday, guest.beverage_pairing);
        if (!ageCheck.valid) {
          errors.push(`Guest ${i + 1}: ${ageCheck.message}`);
        }
      }
    });
  }

  if (!body.stripe_payment_id || typeof body.stripe_payment_id !== 'string') {
    errors.push('A valid Stripe payment ID is required.');
  }

  return errors;
}

module.exports = { validateGuestAge, validateBookingInput };
