/* ============================================================
   BOOKING FLOW — CLIENT-SIDE LOGIC
   ============================================================ */

const API_BASE = '/api';

// ─── State ────────────────────────────────────────────────────
const state = {
  currentStep: 1,
  address: '',
  resolvedAddress: '',
  travelMinutes: 0,
  withinServiceArea: true,
  satelliteConfirmed: false,
  selectedDates: [],
  guests: [createEmptyGuest(true)],
  stripePaymentId: '',
  depositAmount: 0,
  bookingId: '',
};

let calendarMonth, calendarYear;
let stripe, cardElement;

// ─── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  calendarMonth = now.getMonth();
  calendarYear = now.getFullYear();
  renderGuestCards();
});

// ─── Step Navigation ──────────────────────────────────────────
function goToStep(step) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) el.classList.add('hidden');
  }
  document.getElementById('step-1b')?.classList.add('hidden');

  document.getElementById(`step-${step}`)?.classList.remove('hidden');
  state.currentStep = step;
  updateStepper(step);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (step === 2) renderCalendar();
  if (step === 4) initPayment();
}

function updateStepper(activeStep) {
  document.querySelectorAll('.stepper-step').forEach((el) => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (s === activeStep) el.classList.add('active');
    else if (s < activeStep) el.classList.add('completed');
  });
  document.querySelectorAll('.stepper-line').forEach((el) => {
    const l = parseInt(el.dataset.line);
    el.classList.toggle('completed', l < activeStep);
  });
  document.querySelectorAll('.stepper-step.completed .stepper-circle').forEach((el) => {
    el.innerHTML = '✓';
  });
  document.querySelectorAll('.stepper-step:not(.completed) .stepper-circle').forEach((el) => {
    if (!el.closest('.stepper-step').classList.contains('active') && !el.closest('.stepper-step').classList.contains('completed')) {
      el.textContent = el.closest('.stepper-step').dataset.step;
    }
  });
  document.querySelectorAll('.stepper-step.active .stepper-circle').forEach((el) => {
    el.textContent = el.closest('.stepper-step').dataset.step;
  });
}

// ─── Step 1: Address Check ────────────────────────────────────
async function checkAddress() {
  const input = document.getElementById('pickup-address');
  const address = input.value.trim();

  if (address.length < 5) {
    showError('address-error', 'Please enter a valid street address.');
    return;
  }

  hideError('address-error');
  showLoading('Checking your pickup address...');

  try {
    const res = await fetch(`${API_BASE}/check-distance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showError('address-error', data.error || 'Failed to check address.');
      return;
    }

    state.address = address;
    state.resolvedAddress = data.address;
    state.travelMinutes = data.travel_time_minutes;
    state.withinServiceArea = data.within_service_area;

    showServiceAreaResult(data);
  } catch (err) {
    hideLoading();
    showError('address-error', 'Network error. Please try again.');
  }
}

function showServiceAreaResult(data) {
  document.getElementById('step-1').classList.add('hidden');
  const container = document.getElementById('step-1b');
  const card = container.querySelector('.card');

  if (data.within_service_area) {
    card.innerHTML = `
      <div class="service-notice">
        <div class="service-notice-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-success)" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2>Booking Availability</h2>
        <p class="text-secondary">Confirming your eligibility for our exclusive table-to-door pick up service.</p>

        <div class="detail-section" style="text-align:left; max-width:440px; margin:0 auto;">
          <div style="display:flex;align-items:center;gap:0.5rem;color:var(--c-success);font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.75rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Service Available
          </div>
          <h3 style="margin-bottom:0.5rem;">Within 1 Hour Arrival</h3>
          <p class="text-secondary" style="font-size:0.9rem;">Good news! You are within our priority pick up service area. Our shuttle is currently active in your neighborhood.</p>
          <button class="btn btn-primary btn-lg" style="margin-top:1.25rem;" onclick="goToStep(2)">
            Continue Booking →
          </button>
        </div>
      </div>
    `;
  } else {
    const sp = data.satellite_parking;
    card.innerHTML = `
      <div class="service-notice">
        <div class="service-notice-icon" style="background:#F5F5F5;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-secondary)" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <h2>Pickup Range Notification</h2>
        <p>You are outside our standard pickup range. Would you be comfortable meeting at a satellite parking lot?</p>

        <div class="satellite-card">
          <div class="satellite-card-icon">📍</div>
          <h4>${sp.name}</h4>
          <p>${sp.address}<br>${sp.city}, ${sp.state}</p>
        </div>

        <div class="notice-actions">
          <button class="btn btn-primary" onclick="confirmSatellite()">Yes, continue booking</button>
          <button class="btn btn-outline" onclick="cancelSatellite()">No, cancel booking</button>
        </div>
      </div>
    `;
  }

  container.classList.remove('hidden');
}

function confirmSatellite() {
  state.satelliteConfirmed = true;
  goToStep(2);
}

function cancelSatellite() {
  document.getElementById('step-1b').classList.add('hidden');
  document.getElementById('step-1').classList.remove('hidden');
  state.currentStep = 1;
  updateStepper(1);
}

// ─── Step 2: Calendar ─────────────────────────────────────────
function renderCalendar() {
  const cal = document.getElementById('booking-calendar');
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDow = new Date(calendarYear, calendarMonth, 1).getDay();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `
    <div class="calendar-header">
      <button class="calendar-nav" onclick="prevMonth()">‹</button>
      <div class="calendar-title">${monthNames[calendarMonth]} ${calendarYear}</div>
      <button class="calendar-nav" onclick="nextMonth()">›</button>
    </div>
    <div class="calendar-grid">
      <div class="calendar-dow">Sun</div><div class="calendar-dow">Mon</div>
      <div class="calendar-dow">Tue</div><div class="calendar-dow">Wed</div>
      <div class="calendar-dow">Thu</div><div class="calendar-dow">Fri</div>
      <div class="calendar-dow">Sat</div>
  `;

  for (let i = 0; i < firstDow; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calendarYear, calendarMonth, d);
    const dateStr = formatDate(date);
    const isSelected = state.selectedDates.includes(dateStr);
    const isPast = date < today;
    const isToday = date.getTime() === today.getTime();

    let classes = 'calendar-day';
    if (isPast) classes += ' disabled';
    if (isSelected) classes += ' selected';
    if (isToday) classes += ' today';

    html += `<div class="${classes}" onclick="toggleDate('${dateStr}', ${isPast})">${d}</div>`;
  }

  html += '</div>';
  cal.innerHTML = html;
  renderSelectedDates();
}

function prevMonth() {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
}

function nextMonth() {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
}

function toggleDate(dateStr, isPast) {
  if (isPast) return;
  const idx = state.selectedDates.indexOf(dateStr);
  if (idx > -1) {
    state.selectedDates.splice(idx, 1);
  } else if (state.selectedDates.length < 3) {
    state.selectedDates.push(dateStr);
  }
  renderCalendar();
}

function removeDate(dateStr) {
  state.selectedDates = state.selectedDates.filter(d => d !== dateStr);
  renderCalendar();
}

function renderSelectedDates() {
  const list = document.getElementById('selected-dates-list');
  const btn = document.getElementById('btn-continue-dates');

  let html = state.selectedDates.map(d => {
    const parts = d.split('-');
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<span class="date-chip">${label} <button class="date-chip-remove" onclick="removeDate('${d}')">×</button></span>`;
  }).join('');

  if (state.selectedDates.length < 3) {
    html += '<span class="select-more-chip">+ Select more</span>';
  }

  list.innerHTML = html;
  btn.disabled = state.selectedDates.length === 0;
}

// ─── Step 3: Guests ───────────────────────────────────────────
function createEmptyGuest(isPrimary) {
  return {
    name: '',
    birthday: '',
    phone: '',
    email: '',
    beverage_pairing: 'alcoholic',
    allergies: '',
    is_primary: isPrimary || false,
  };
}

function addGuest() {
  state.guests.push(createEmptyGuest(false));
  renderGuestCards();
}

function removeGuest(index) {
  if (state.guests.length <= 1) return;
  state.guests.splice(index, 1);
  if (!state.guests.some(g => g.is_primary)) state.guests[0].is_primary = true;
  renderGuestCards();
}

function renderGuestCards() {
  const container = document.getElementById('guest-cards-container');
  if (!container) return;

  container.innerHTML = state.guests.map((guest, i) => {
    const isPrimary = i === 0;
    return `
      <div class="guest-card">
        <div class="guest-card-header">
          <div>
            <div class="guest-card-title">Guest ${i + 1}${isPrimary ? ' (Primary)' : ''}</div>
            ${isPrimary ? '<div class="guest-card-subtitle">Main contact person</div>' : ''}
          </div>
          ${!isPrimary ? `<button class="guest-remove-btn" onclick="removeGuest(${i})" title="Remove guest">🗑</button>` : ''}
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Guest Name <span class="required">*</span></label>
            <input type="text" class="form-input" placeholder="Full name" value="${escapeHtml(guest.name)}" onchange="updateGuest(${i}, 'name', this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">Birthday <span class="required">*</span></label>
            <input type="date" class="form-input" value="${guest.birthday}" onchange="updateGuest(${i}, 'birthday', this.value)">
          </div>
        </div>

        ${isPrimary ? `
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone Number <span class="required">*</span></label>
              <input type="tel" class="form-input" placeholder="+1 (415) 484-3205" value="${escapeHtml(guest.phone || '')}" onchange="updateGuest(${i}, 'phone', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Email <span class="required">*</span></label>
              <input type="email" class="form-input" placeholder="email@example.com" value="${escapeHtml(guest.email || '')}" onchange="updateGuest(${i}, 'email', this.value)">
            </div>
          </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label">Beverage Pairing <span class="required">*</span></label>
          <div class="toggle-group">
            <button class="toggle-btn ${guest.beverage_pairing === 'alcoholic' ? 'active' : ''}" onclick="updateGuest(${i}, 'beverage_pairing', 'alcoholic')">
              🍷 Alcoholic
            </button>
            <button class="toggle-btn ${guest.beverage_pairing === 'non-alcoholic' ? 'active' : ''}" onclick="updateGuest(${i}, 'beverage_pairing', 'non-alcoholic')">
              🥤 Non-alcoholic
            </button>
          </div>
          <div id="age-warning-${i}" class="form-error hidden"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Allergies & Special Requirements</label>
          <textarea class="form-input" placeholder="Please let us know about any allergies or dietary needs (e.g., Nut allergy, Gluten-free, Vegan)..." onchange="updateGuest(${i}, 'allergies', this.value)">${escapeHtml(guest.allergies)}</textarea>
        </div>
      </div>
    `;
  }).join('');
}

function updateGuest(index, field, value) {
  state.guests[index][field] = value;

  // Age check for beverage pairing
  if (field === 'beverage_pairing' || field === 'birthday') {
    const guest = state.guests[index];
    const warningEl = document.getElementById(`age-warning-${index}`);
    if (warningEl && guest.birthday && guest.beverage_pairing === 'alcoholic') {
      const age = calcAge(guest.birthday);
      if (age < 21) {
        warningEl.textContent = `Guest must be 21 or older for alcoholic pairing (current age: ${age}). Switching to non-alcoholic.`;
        warningEl.classList.remove('hidden');
        state.guests[index].beverage_pairing = 'non-alcoholic';
        setTimeout(() => renderGuestCards(), 100);
        return;
      } else {
        warningEl.classList.add('hidden');
      }
    }
  }
}

function calcAge(birthday) {
  const dob = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function validateAndContinueToPayment() {
  const errors = [];
  hideError('guest-errors');

  state.guests.forEach((g, i) => {
    if (!g.name || g.name.trim().length < 2) errors.push(`Guest ${i+1}: Name is required.`);
    if (!g.birthday) errors.push(`Guest ${i+1}: Birthday is required.`);
    if (i === 0 && !g.phone) errors.push('Primary guest: Phone number is required.');
    if (i === 0 && !g.email) errors.push('Primary guest: Email is required.');
    if (g.birthday && g.beverage_pairing === 'alcoholic' && calcAge(g.birthday) < 21) {
      errors.push(`Guest ${i+1}: Must be 21+ for alcoholic beverage pairing.`);
    }
  });

  if (errors.length > 0) {
    showError('guest-errors', errors.join('<br>'));
    return;
  }

  goToStep(4);
}

// ─── Step 4: Payment (Stripe) ─────────────────────────────────
async function initPayment() {
  const guestCount = state.guests.length;
  const total = guestCount * 50;

  document.getElementById('guest-count-display').textContent = `${guestCount} Guest${guestCount > 1 ? 's' : ''}`;
  document.getElementById('payment-total').textContent = `$${total.toFixed(2)}`;

  if (!stripe) {
    // Stripe publishable key will be set during deployment
    const stripeKeyMeta = document.querySelector('meta[name="stripe-publishable-key"]');
    const stripeKey = stripeKeyMeta ? stripeKeyMeta.content : 'pk_test_placeholder';
    stripe = Stripe(stripeKey);
  }

  showLoading('Setting up payment...');

  try {
    const res = await fetch(`${API_BASE}/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_count: guestCount }),
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showError('card-errors', data.error || 'Failed to initialize payment.');
      return;
    }

    state.stripePaymentId = data.payment_intent_id;
    state.depositAmount = data.amount;

    const elements = stripe.elements({ clientSecret: data.client_secret });
    cardElement = elements.create('payment');
    document.getElementById('stripe-card-element').innerHTML = '';
    cardElement.mount('#stripe-card-element');

    cardElement.on('ready', () => {
      document.getElementById('btn-pay').disabled = false;
    });

    cardElement.on('change', (event) => {
      const display = document.getElementById('card-errors');
      display.textContent = event.error ? event.error.message : '';
    });
  } catch (err) {
    hideLoading();
    showError('card-errors', 'Failed to initialize payment. Please try again.');
  }
}

async function handlePayment() {
  const btn = document.getElementById('btn-pay');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  showLoading('Processing your payment...');

  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements: cardElement._elements,
      confirmParams: {},
      redirect: 'if_required',
    });

    if (error) {
      hideLoading();
      document.getElementById('card-errors').textContent = error.message;
      btn.disabled = false;
      btn.innerHTML = '🔒 Pay Deposit & Confirm';
      return;
    }

    if (paymentIntent.status === 'succeeded') {
      await createBooking();
    }
  } catch (err) {
    hideLoading();
    document.getElementById('card-errors').textContent = 'Payment failed. Please try again.';
    btn.disabled = false;
    btn.innerHTML = '🔒 Pay Deposit & Confirm';
  }
}

async function createBooking() {
  showLoading('Creating your reservation...');

  const payload = {
    pickup_address: state.address,
    travel_time_minutes: state.travelMinutes,
    satellite_confirmation: state.satelliteConfirmed,
    preferred_dates: state.selectedDates,
    stripe_payment_id: state.stripePaymentId,
    deposit_amount: state.depositAmount,
    occasion: '',
    phone: state.guests[0].phone || '',
    email: state.guests[0].email || '',
    guests: state.guests.map(g => ({
      name: g.name,
      birthday: g.birthday,
      beverage_pairing: g.beverage_pairing,
      allergies: g.allergies,
    })),
  };

  try {
    const res = await fetch(`${API_BASE}/create-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showError('card-errors', (data.errors || [data.error]).join(', '));
      return;
    }

    state.bookingId = data.booking.id;
    showConfirmation();
  } catch (err) {
    hideLoading();
    showError('card-errors', 'Failed to create booking. Your payment was processed — please contact us.');
  }
}

// ─── Step 5: Confirmation ─────────────────────────────────────
function showConfirmation() {
  document.getElementById('confirm-address').textContent = state.resolvedAddress || state.address;
  document.getElementById('confirm-dates').textContent = state.selectedDates.map(d => {
    const parts = d.split('-');
    return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }).join(',  ');
  document.getElementById('confirm-guests').textContent = `${state.guests.length} Guest${state.guests.length > 1 ? 's' : ''}`;
  goToStep(5);
}

// ─── Utilities ────────────────────────────────────────────────
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) { el.innerHTML = message; el.classList.remove('hidden'); }
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) { el.innerHTML = ''; el.classList.add('hidden'); }
}

function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Processing...';
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}
