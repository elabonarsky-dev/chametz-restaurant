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
let stripe, stripeElements, cardElement;

// ─── Dates info cache (from admin settings) ───────────────────
// Key: "YYYY-M" → { closed: Set<YYYY-MM-DD>, special: Map<YYYY-MM-DD, notes> }
const datesInfoCache = {};

async function loadDatesInfo(year, month) {
  const key = `${year}-${month}`;
  if (datesInfoCache[key] !== undefined) return; // already fetched
  // Default: empty open set means ALL dates are closed until we hear back from the API
  datesInfoCache[key] = { open: new Set(), special: new Map(), booked: new Map(), defaultLimit: 45 };
  try {
    const res = await fetch(`${API_BASE}/manage-dates?year=${year}&month=${month + 1}`);
    if (res.ok) {
      const data = await res.json();
      const open = new Set();    // only dates explicitly set is_open = true
      const special = new Map();
      const booked = new Map();  // dateStr → { count, max }
      const defaultLimit = data.default_limit || 45;
      (data.dates || []).forEach(d => {
        const dateStr = String(d.date).split('T')[0];
        if (d.is_open === true) open.add(dateStr);
        // Special events only matter if the date is open
        if (d.is_special_event && d.is_open) special.set(dateStr, d.notes || 'Special Event');
        const max = d.max_guests || defaultLimit;
        const count = d.booked_count || 0;
        booked.set(dateStr, { count, max });
      });
      datesInfoCache[key] = { open, special, booked, defaultLimit };
    }
  } catch (_) { /* silent — calendar works without admin data */ }
}

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

  if (step === 2) {
    loadDatesInfo(calendarYear, calendarMonth).then(() => renderCalendar());
  }
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
      const msg = data.error || 'Failed to check address.';
      if (data.address_not_found) {
        // Render as HTML so the email becomes a clickable link
        const errEl = document.getElementById('address-error');
        if (errEl) {
          errEl.innerHTML = msg.replace(
            'info@thechametz.com',
            '<a href="mailto:info@thechametz.com" style="color:inherit;font-weight:600;">info@thechametz.com</a>'
          );
          errEl.classList.remove('hidden');
        }
      } else {
        showError('address-error', msg);
      }
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

  const cacheKey = `${calendarYear}-${calendarMonth}`;
  const { open: openSet = new Set(), special: specialMap = new Map(), booked: bookedMap = new Map() } =
    datesInfoCache[cacheKey] || {};

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calendarYear, calendarMonth, d);
    const dateStr = formatDate(date);
    const isSelected = state.selectedDates.includes(dateStr);
    const isPast = date < today;
    // A date is only open if it's explicitly in the open set
    const isOpen = openSet.has(dateStr);
    const isClosed = !isOpen;
    const isSpecial = specialMap.has(dateStr);

    // Fully-booked dates are also disabled
    const bookedInfo = bookedMap.get(dateStr);
    const isFullyBooked = isOpen && bookedInfo && bookedInfo.count >= bookedInfo.max;
    const isDisabled = isPast || isClosed || isFullyBooked;

    let classes = 'calendar-day';
    if (isDisabled) classes += ' disabled';
    if (isSelected) classes += ' selected';
    if (isClosed && !isPast) classes += ' closed-by-admin';
    if (isSpecial && !isPast) classes += ' special-event';
    if (isFullyBooked && !isPast) classes += ' fully-booked';

    // data-tooltip carries the event name; CSS shows it on :hover
    const notes = isSpecial ? specialMap.get(dateStr) : '';
    const tooltipAttr = isSpecial && !isClosed && !isPast
      ? ` data-tooltip="${notes.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}"`
      : '';
    const starHtml = isSpecial && !isClosed && !isPast
      ? '<span class="day-event-star">★</span>'
      : '';

    // Booking counter in top-right corner
    const counterHtml = bookedInfo && !isPast
      ? `<span class="bk-day-counter${isFullyBooked ? ' bk-counter-full' : ''}">${bookedInfo.count}/${bookedInfo.max}</span>`
      : '';

    html += `<div class="${classes}"${tooltipAttr} onclick="toggleDate('${dateStr}', ${isDisabled})">${counterHtml}${d}${starHtml}</div>`;
  }

  html += '</div>';
  cal.innerHTML = html;
  renderSelectedDates();
}

function prevMonth() {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  loadDatesInfo(calendarYear, calendarMonth).then(() => renderCalendar());
}

function nextMonth() {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  loadDatesInfo(calendarYear, calendarMonth).then(() => renderCalendar());
}

function toggleDate(dateStr, isPast) {
  if (isPast) return;
  const idx = state.selectedDates.indexOf(dateStr);
  if (idx > -1) {
    state.selectedDates.splice(idx, 1);
  } else {
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

/** Birthday: type 11081982 → 11/08/1982 */
function formatBirthdayFromDigits(raw) {
  const d = String(raw).replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Phone: type 14154843205 → +1 (415) 484-3205 */
function formatPhoneFromDigits(raw) {
  let d = String(raw).replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d[0] === '1') {
    const rest = d.slice(1);
    if (rest.length === 0) return '+1 ';
    if (rest.length <= 3) return `+1 (${rest}`;
    if (rest.length <= 6) return `+1 (${rest.slice(0, 3)}) ${rest.slice(3)}`;
    return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  if (d.length <= 3) return `+1 (${d}`;
  if (d.length <= 6) return `+1 (${d.slice(0, 3)}) ${d.slice(3)}`;
  return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

function guestCanSelectAlcoholic(birthday) {
  const digits = (birthday || '').replace(/\D/g, '');
  if (digits.length !== 8) return false;
  const formatted = formatBirthdayFromDigits(digits);
  const age = calcAge(formatted);
  return age >= 21;
}

function handleBirthdayInput(index, input) {
  const formatted = formatBirthdayFromDigits(input.value);
  if (input.value !== formatted) input.value = formatted;
  state.guests[index].birthday = formatted;
  updateGuestBeverageUI(index);
}

function handlePhoneInput(index, input) {
  const formatted = formatPhoneFromDigits(input.value);
  if (input.value !== formatted) input.value = formatted;
  state.guests[index].phone = formatted;
}

function updateGuestBeverageUI(index) {
  const container = document.getElementById('guest-cards-container');
  if (!container) return;
  const card = container.querySelector(`[data-guest-index="${index}"]`);
  if (!card) return;
  const alcoholicBtn = card.querySelector('[data-pairing="alcoholic"]');
  const nonAlcoholicBtn = card.querySelector('[data-pairing="non-alcoholic"]');
  const warningEl = card.querySelector('[data-age-hint]');
  const g = state.guests[index];
  const can = guestCanSelectAlcoholic(g.birthday);

  if (!can && g.beverage_pairing === 'alcoholic') {
    g.beverage_pairing = 'non-alcoholic';
  }

  if (alcoholicBtn) {
    alcoholicBtn.disabled = !can;
    alcoholicBtn.classList.toggle('toggle-btn-disabled', !can);
    alcoholicBtn.title = can ? '' : 'Must be 21 or older for alcoholic beverage pairing.';
    alcoholicBtn.classList.toggle('active', g.beverage_pairing === 'alcoholic');
  }
  if (nonAlcoholicBtn) {
    nonAlcoholicBtn.classList.toggle('active', g.beverage_pairing === 'non-alcoholic');
  }

  if (warningEl) {
    const digits = (g.birthday || '').replace(/\D/g, '');
    const age = digits.length === 8 ? calcAge(g.birthday) : -1;
    warningEl.classList.remove('age-hint-info');
    if (digits.length === 8 && age >= 0 && age < 21) {
      warningEl.textContent = 'Guest must be 21 or older for alcoholic pairing.';
      warningEl.classList.remove('hidden');
    } else if (digits.length > 0 && digits.length < 8) {
      warningEl.textContent = 'Enter full date of birth (8 digits) to enable alcoholic pairing.';
      warningEl.classList.add('age-hint-info');
      warningEl.classList.remove('hidden');
    } else {
      warningEl.classList.add('hidden');
    }
  }
}

function renderGuestCards() {
  const container = document.getElementById('guest-cards-container');
  if (!container) return;

  state.guests.forEach((g) => {
    if (!guestCanSelectAlcoholic(g.birthday) && g.beverage_pairing === 'alcoholic') {
      g.beverage_pairing = 'non-alcoholic';
    }
  });

  container.innerHTML = state.guests.map((guest, i) => {
    const isPrimary = i === 0;
    const canAlcoholic = guestCanSelectAlcoholic(guest.birthday);
    const bVal = guest.birthday ? escapeHtml(guest.birthday) : '';
    const phoneVal = guest.phone ? escapeHtml(guest.phone) : '';
    return `
      <div class="guest-card" data-guest-index="${i}">
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
            <input type="text" class="form-input" inputmode="numeric" autocomplete="bday" placeholder="mm/dd/yyyy" value="${bVal}"
              oninput="handleBirthdayInput(${i}, this)" onblur="state.guests[${i}].birthday=this.value; updateGuestBeverageUI(${i})">
          </div>
        </div>

        ${isPrimary ? `
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone Number <span class="required">*</span></label>
              <input type="tel" class="form-input" inputmode="numeric" autocomplete="tel" placeholder="+1 (415) 484-3205" value="${phoneVal}"
                oninput="handlePhoneInput(${i}, this)" onblur="state.guests[${i}].phone=this.value">
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
            <button type="button" data-pairing="alcoholic" class="toggle-btn ${guest.beverage_pairing === 'alcoholic' ? 'active' : ''} ${!canAlcoholic ? 'toggle-btn-disabled' : ''}"
              ${!canAlcoholic ? 'disabled' : ''} title="${!canAlcoholic ? 'Must be 21 or older for alcoholic beverage pairing.' : ''}"
              onclick="updateGuest(${i}, 'beverage_pairing', 'alcoholic')">
              🍷 Alcoholic
            </button>
            <button type="button" data-pairing="non-alcoholic" class="toggle-btn ${guest.beverage_pairing === 'non-alcoholic' ? 'active' : ''}"
              onclick="updateGuest(${i}, 'beverage_pairing', 'non-alcoholic')">
              🥤 Non-alcoholic
            </button>
          </div>
          <div data-age-hint id="age-warning-${i}" class="alert mt-1 ${canAlcoholic ? 'hidden' : ((guest.birthday || '').replace(/\D/g, '').length < 8 ? 'age-hint-info' : 'alert-error')}" style="font-size:0.8125rem;">${!canAlcoholic && (guest.birthday || '').replace(/\D/g, '').length < 8 ? 'Enter full date of birth (8 digits) to enable alcoholic pairing.' : (!canAlcoholic && (guest.birthday || '').replace(/\D/g, '').length === 8 ? 'Guest must be 21 or older for alcoholic pairing.' : '')}</div>
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
  if (field === 'beverage_pairing' && value === 'alcoholic' && !guestCanSelectAlcoholic(state.guests[index].birthday)) {
    return;
  }
  state.guests[index][field] = value;

  if (field === 'beverage_pairing') {
    updateGuestBeverageUI(index);
    return;
  }
}

/** YYYY-MM-DD for API / PostgreSQL */
function birthdayToApiFormat(mmddyyyy) {
  const parts = (mmddyyyy || '').split('/');
  if (parts.length !== 3) return mmddyyyy;
  const m = parts[0].padStart(2, '0');
  const d = parts[1].padStart(2, '0');
  const y = parts[2];
  if (y.length !== 4) return mmddyyyy;
  return `${y}-${m}-${d}`;
}

function phoneDigitsCount(phone) {
  return (phone || '').replace(/\D/g, '').length;
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
    const bdDigits = (g.birthday || '').replace(/\D/g, '');
    if (bdDigits.length !== 8) errors.push(`Guest ${i+1}: Enter a complete birthday (mm/dd/yyyy).`);
    else if (calcAge(g.birthday) < 0) errors.push(`Guest ${i+1}: Invalid birthday.`);
    if (i === 0 && phoneDigitsCount(g.phone) < 10) {
      errors.push('Primary guest: Enter a complete US phone number (10 digits, or 11 starting with 1).');
    }
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

    stripeElements = stripe.elements({ clientSecret: data.client_secret });
    cardElement = stripeElements.create('payment');
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
      elements: stripeElements,
      confirmParams: {
        return_url: window.location.origin + window.location.pathname + '#payment',
      },
      redirect: 'if_required',
    });

    if (error) {
      hideLoading();
      showError('card-errors', error.message);
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Pay Deposit & Confirm';
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      await createBooking();
    }
  } catch (err) {
    hideLoading();
    const message = (err && err.message) ? err.message : 'Payment failed. Please try again.';
    showError('card-errors', message);
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Pay Deposit & Confirm';
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
      birthday: birthdayToApiFormat(g.birthday),
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
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return formatConfirmDate(dateObj);
  }).join(', ');
  document.getElementById('confirm-guests').textContent = `${state.guests.length} Guest${state.guests.length > 1 ? 's' : ''}`;
  goToStep(5);
}

// ─── Utilities ────────────────────────────────────────────────
/** e.g. Mar 17 2026 (no comma before year) */
function formatConfirmDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

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
