/* ============================================================
   BOOKING FLOW — CLIENT-SIDE LOGIC
   ============================================================ */

const API_BASE = '/api';

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
  // Hide all steps
  document.querySelectorAll('.main-content').forEach(el => el.classList.add('hidden'));
  
  // Show the target step
  const stepEl = document.getElementById(`step-${step}`);
  if (stepEl) stepEl.classList.remove('hidden');
  
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
    const circle = el.querySelector('.stepper-circle');
    
    if (s < activeStep) {
      el.classList.add('completed');
      circle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (s === activeStep) {
      el.classList.add('active');
      circle.textContent = s;
    } else {
      circle.textContent = s;
    }
  });
  
  document.querySelectorAll('.stepper-line').forEach((el) => {
    const l = parseInt(el.dataset.line);
    el.classList.toggle('completed', l < activeStep);
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
  
  if (data.within_service_area) {
    document.getElementById('step-1b-within').classList.remove('hidden');
  } else {
    document.getElementById('step-1b-outside').classList.remove('hidden');
  }
}

function confirmSatellite() {
  state.satelliteConfirmed = true;
  document.getElementById('step-1b-outside').classList.add('hidden');
  goToStep(2);
}

function cancelSatellite() {
  document.getElementById('step-1b-outside').classList.add('hidden');
  document.getElementById('step-1').classList.remove('hidden');
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

    let classes = 'calendar-day';
    if (isPast) classes += ' disabled';
    if (isSelected) classes += ' selected';

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
          ${!isPrimary ? `<button class="guest-remove-btn" onclick="removeGuest(${i})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>` : ''}
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Guest Name <span class="required">*</span></label>
            <input type="text" class="form-input" placeholder="Full name" value="${escapeHtml(guest.name)}" onchange="updateGuest(${i}, 'name', this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">Birthday <span class="required">*</span></label>
            <input type="text" class="form-input" placeholder="mm/dd/yyyy" value="${guest.birthday}" onchange="updateGuest(${i}, 'birthday', this.value)">
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
            <button type="button" class="toggle-btn ${guest.beverage_pairing === 'alcoholic' ? 'active' : ''}" onclick="updateGuest(${i}, 'beverage_pairing', 'alcoholic')">
              🍷 Alcoholic
            </button>
            <button type="button" class="toggle-btn ${guest.beverage_pairing === 'non-alcoholic' ? 'active' : ''}" onclick="updateGuest(${i}, 'beverage_pairing', 'non-alcoholic')">
              🥤 Non-alcoholic
            </button>
          </div>
          <div id="age-warning-${i}" class="alert alert-error hidden mt-1"></div>
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

  if (field === 'beverage_pairing') {
    const guest = state.guests[index];
    const warningEl = document.getElementById(`age-warning-${index}`);
    
    if (warningEl && guest.birthday && value === 'alcoholic') {
      const age = calcAge(guest.birthday);
      if (age >= 0 && age < 21) {
        warningEl.textContent = `Guest must be 21 or older for alcoholic pairing. Switching to non-alcoholic.`;
        warningEl.classList.remove('hidden');
        state.guests[index].beverage_pairing = 'non-alcoholic';
      } else {
        warningEl.classList.add('hidden');
      }
    } else if (warningEl) {
      warningEl.classList.add('hidden');
    }
    
    updateBeverageToggle(index);
    return;
  }

  if (field === 'birthday') {
    const guest = state.guests[index];
    const warningEl = document.getElementById(`age-warning-${index}`);
    if (warningEl && guest.birthday && guest.beverage_pairing === 'alcoholic') {
      const age = calcAge(guest.birthday);
      if (age >= 0 && age < 21) {
        warningEl.textContent = `Guest must be 21 or older for alcoholic pairing. Switching to non-alcoholic.`;
        warningEl.classList.remove('hidden');
        state.guests[index].beverage_pairing = 'non-alcoholic';
        updateBeverageToggle(index);
      } else {
        warningEl.classList.add('hidden');
      }
    }
  }
}

function updateBeverageToggle(index) {
  const guest = state.guests[index];
  const container = document.getElementById('guest-cards-container');
  const guestCards = container.querySelectorAll('.guest-card');
  
  if (guestCards[index]) {
    const toggleBtns = guestCards[index].querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
      btn.classList.remove('active');
      if (btn.textContent.includes('Alcoholic') && !btn.textContent.includes('Non') && guest.beverage_pairing === 'alcoholic') {
        btn.classList.add('active');
      }
      if (btn.textContent.includes('Non-alcoholic') && guest.beverage_pairing === 'non-alcoholic') {
        btn.classList.add('active');
      }
    });
  }
}

function calcAge(birthday) {
  const parts = birthday.includes('/') ? birthday.split('/') : birthday.split('-');
  let dob;
  if (parts.length === 3) {
    if (birthday.includes('/')) {
      dob = new Date(parts[2], parts[0] - 1, parts[1]);
    } else {
      dob = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  } else {
    return -1;
  }
  
  if (isNaN(dob.getTime())) return -1;
  
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
    const age = calcAge(g.birthday);
    if (age >= 0 && g.beverage_pairing === 'alcoholic' && age < 21) {
      errors.push(`Guest ${i+1}: Must be 21+ for alcoholic beverage pairing.`);
    }
  });

  if (errors.length > 0) {
    showError('guest-errors', errors.join('<br>'));
    return;
  }

  goToStep(4);
}

// ─── Step 4: Payment ─────────────────────────────────────────
async function initPayment() {
  const guestCount = state.guests.length;
  const total = guestCount * 50;

  document.getElementById('guest-count-display').textContent = `${guestCount} Guest${guestCount > 1 ? 's' : ''}`;
  document.getElementById('payment-total').textContent = `$${total.toFixed(2)}`;

  if (!stripe) {
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
      if (event.error) {
        display.textContent = event.error.message;
        display.classList.remove('hidden');
      } else {
        display.classList.add('hidden');
      }
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
      showError('card-errors', error.message);
      btn.disabled = false;
      btn.innerHTML = '🔒 Pay Deposit & Confirm';
      return;
    }

    if (paymentIntent.status === 'succeeded') {
      await createBooking();
    }
  } catch (err) {
    hideLoading();
    showError('card-errors', 'Payment failed. Please try again.');
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
  }).join(', ');
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
