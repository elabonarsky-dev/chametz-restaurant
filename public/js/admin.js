/* ============================================================
   ADMIN PORTAL — CLIENT-SIDE LOGIC
   ============================================================ */

const API_BASE = '/api';
let adminToken = '';
let currentPage = 1;
let searchQuery = '';

// Admin calendar state
let adminCalMonth, adminCalYear, adminDatesCache = {};
let selectedAdminDate = null;

// ─── Auth ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('admin_token');
  if (saved) {
    adminToken = saved;
    onLoginSuccess();
  }
  document.getElementById('admin-secret-input')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') adminLogin();
  });
});

async function adminLogin() {
  const input = document.getElementById('admin-secret-input');
  const secret = input.value.trim();
  if (!secret) {
    showLoginError('Please enter the admin secret.');
    return;
  }

  showLoading('Authenticating...');

  try {
    const res = await fetch(`${API_BASE}/get-bookings?page=1&limit=1`, {
      headers: { 'Authorization': `Bearer ${secret}` },
    });

    hideLoading();

    if (res.status === 401) {
      showLoginError('Invalid admin credentials.');
      return;
    }

    adminToken = secret;
    sessionStorage.setItem('admin_token', secret);
    onLoginSuccess();
  } catch {
    hideLoading();
    showLoginError('Connection error. Please try again.');
  }
}

function onLoginSuccess() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('admin-layout').classList.remove('hidden');
  loadBookings();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  };
}

// ─── Navigation ───────────────────────────────────────────────
function navigateTo(page) {
  ['bookings', 'booking-detail', 'dates', 'settings'].forEach((p) => {
    document.getElementById(`page-${p}`)?.classList.add('hidden');
  });
  document.getElementById(`page-${page}`)?.classList.remove('hidden');

  document.querySelectorAll('.sidebar-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  if (page === 'bookings') loadBookings();
  if (page === 'dates') initAdminCalendar();
}

// ─── Bookings List ────────────────────────────────────────────
async function loadBookings() {
  try {
    const params = new URLSearchParams({ page: currentPage, limit: 10 });
    if (searchQuery) params.set('search', searchQuery);

    const res = await fetch(`${API_BASE}/get-bookings?${params}`, { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) return;

    renderStats(data.pagination.total);
    renderBookingsTable(data.bookings, data.pagination);
  } catch {
    document.getElementById('bookings-tbody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--c-error);">Failed to load bookings.</td></tr>';
  }
}

function renderStats(total) {
  document.getElementById('stat-total').textContent = total.toLocaleString();
  document.getElementById('stat-pending').textContent = '—';
  document.getElementById('stat-today').textContent = '—';
}

function renderBookingsTable(bookings, pagination) {
  const tbody = document.getElementById('bookings-tbody');

  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">No bookings found.</td></tr>';
    document.getElementById('showing-info').textContent = 'Showing 0 of 0';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = bookings.map((b) => {
    const dates = parseDates(b.preferred_dates);
    const created = new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const shortId = b.id.substring(0, 8).toUpperCase();
    const statusClass = b.status || 'pending';

    return `
      <tr>
        <td><a class="booking-id-link" href="#" onclick="viewBooking('${b.id}')">#BK-${shortId}</a></td>
        <td>${escapeHtml(b.pickup_address?.substring(0, 40) || '—')}</td>
        <td>${dates}</td>
        <td>${b.guest_count || '—'}</td>
        <td><span class="status-badge ${statusClass}">${capitalize(statusClass)}</span></td>
        <td>${created}</td>
        <td>
          <div class="table-actions">
            <button class="table-action-link view" onclick="viewBooking('${b.id}')">View</button>
            <button class="table-action-link delete" onclick="deleteBooking('${b.id}')">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);
  document.getElementById('showing-info').textContent = `Showing ${start}–${end} of ${pagination.total}`;
  renderPagination(pagination);
}

function renderPagination(p) {
  const el = document.getElementById('pagination');
  if (p.total_pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${p.page <= 1 ? 'disabled' : ''} onclick="changePage(${p.page - 1})">‹</button>`;

  const maxVisible = 5;
  let startPage = Math.max(1, p.page - 2);
  let endPage = Math.min(p.total_pages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === p.page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }

  if (endPage < p.total_pages) {
    html += '<span style="padding:0 4px;">…</span>';
    html += `<button class="page-btn" onclick="changePage(${p.total_pages})">${p.total_pages}</button>`;
  }

  html += `<button class="page-btn" ${p.page >= p.total_pages ? 'disabled' : ''} onclick="changePage(${p.page + 1})">›</button>`;
  el.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  loadBookings();
}

function handleSearch(event) {
  if (event.key === 'Enter') {
    searchQuery = event.target.value.trim();
    currentPage = 1;
    loadBookings();
  }
}

// ─── Booking Detail ───────────────────────────────────────────
async function viewBooking(id) {
  showLoading('Loading booking details...');

  try {
    const res = await fetch(`${API_BASE}/get-booking?id=${id}`, { headers: authHeaders() });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { alert(data.error || 'Failed to load booking.'); return; }

    renderBookingDetail(data.booking, data.guests);
    navigateTo('booking-detail');
  } catch {
    hideLoading();
    alert('Failed to load booking details.');
  }
}

function renderBookingDetail(booking, guests) {
  const shortId = booking.id.substring(0, 8).toUpperCase();
  const statusClass = booking.status || 'pending';
  const dates = parseDates(booking.preferred_dates);
  const primaryGuest = guests.find(g => g.is_primary) || guests[0];
  const deposit = booking.deposit_amount ? `$${(booking.deposit_amount / 100).toFixed(2)}` : '—';

  document.getElementById('booking-detail-content').innerHTML = `
    <div class="detail-header">
      <span class="status-badge ${statusClass}">${capitalize(statusClass)}</span>
      <span class="text-muted text-sm" style="margin-left:0.5rem;">#${shortId}</span>
      <h1>${escapeHtml(primaryGuest?.name || 'Guest')}</h1>
      <div class="detail-meta">
        ${booking.phone ? `<span>${escapeHtml(booking.phone)}</span>` : ''}
        ${booking.email ? `<span>${escapeHtml(booking.email)}</span>` : ''}
      </div>
      <p class="text-secondary" style="margin-top:0.25rem;">
        Reservation for ${guests.length} guest${guests.length > 1 ? 's' : ''}${booking.occasion ? ' · ' + escapeHtml(booking.occasion) : ''}
      </p>
    </div>

    <div class="detail-grid">
      <div>
        <div class="detail-section">
          <h3>🕐 Pickup & Schedule</h3>
          <div class="form-row">
            <div class="detail-field">
              <div class="detail-field-label">Pickup Location</div>
              <div class="detail-field-value">📍 ${escapeHtml(booking.pickup_address)}</div>
            </div>
            <div class="detail-field">
              <div class="detail-field-label">Preferred Dates</div>
              <div class="detail-field-value">📅 ${dates}</div>
            </div>
          </div>
        </div>

        <div class="detail-section" style="margin-top:1.5rem;">
          <h3>👥 Guest List</h3>
          ${guests.map((g, i) => {
            const initials = g.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const bday = new Date(g.birthday).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            return `
              <div class="guest-list-item">
                <div class="guest-avatar ${g.is_primary ? 'primary' : 'secondary'}">${initials}</div>
                <div class="guest-info">
                  <div class="guest-info-name">
                    ${escapeHtml(g.name)}
                    ${g.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                  </div>
                  <div class="guest-info-birthday">🎂 ${bday}</div>
                </div>
                <div class="guest-pairing">Pairing<span>${capitalize(g.beverage_pairing)}</span></div>
                ${g.allergies ? `<div class="allergy-badge">⚠ ${escapeHtml(g.allergies)} (${g.name.split(' ')[0]})</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div>
        <div class="payment-card">
          <h3>💳 Payment Status</h3>
          <div class="payment-amount">
            <span class="payment-amount-label">Deposit Paid</span>
            <span class="payment-amount-value">${deposit}</span>
          </div>
          ${booking.stripe_payment_id ? `
            <div class="text-sm text-muted" style="margin-top:0.5rem;">
              Stripe: ${booking.stripe_payment_id.substring(0, 20)}…
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// ─── Delete Booking ───────────────────────────────────────────
async function deleteBooking(id) {
  if (!confirm('Are you sure you want to delete this booking? This cannot be undone.')) return;

  showLoading('Deleting booking...');

  try {
    const res = await fetch(`${API_BASE}/delete-booking?id=${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    hideLoading();

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete booking.');
      return;
    }

    loadBookings();
  } catch {
    hideLoading();
    alert('Failed to delete booking.');
  }
}

// ─── Manage Dates (Calendar) ──────────────────────────────────
function initAdminCalendar() {
  const now = new Date();
  adminCalMonth = now.getMonth();
  adminCalYear = now.getFullYear();
  loadAdminDates();
}

async function loadAdminDates() {
  try {
    const params = new URLSearchParams({ month: adminCalMonth + 1, year: adminCalYear });
    const res = await fetch(`${API_BASE}/manage-dates?${params}`, { headers: authHeaders() });
    const data = await res.json();

    adminDatesCache = {};
    (data.dates || []).forEach((d) => {
      const key = d.date.substring(0, 10);
      adminDatesCache[key] = d;
    });

    renderAdminCalendar();
  } catch {
    document.getElementById('admin-calendar-card').innerHTML = '<p class="text-secondary" style="padding:2rem;text-align:center;">Failed to load dates.</p>';
  }
}

function renderAdminCalendar() {
  const card = document.getElementById('admin-calendar-card');
  const daysInMonth = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();
  const firstDow = new Date(adminCalYear, adminCalMonth, 1).getDay();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `
    <div class="admin-calendar-header">
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <button class="calendar-nav" onclick="adminPrevMonth()">‹</button>
        <span class="calendar-title">${monthNames[adminCalMonth]} ${adminCalYear}</span>
        <button class="calendar-nav" onclick="adminNextMonth()">›</button>
      </div>
      <div class="view-toggle">
        <button class="view-toggle-btn active">Month View</button>
        <button class="view-toggle-btn">Week View</button>
      </div>
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
    const date = new Date(adminCalYear, adminCalMonth, d);
    const dateStr = formatDateStr(date);
    const dateData = adminDatesCache[dateStr];
    const isToday = date.getTime() === today.getTime();
    const isSelected = selectedAdminDate === dateStr;

    let classes = 'calendar-day calendar-day-admin';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';

    let dots = '';
    if (dateData) {
      if (dateData.is_open) dots += '<span class="dot open"></span>';
      dots += '<span class="dot bookings"></span>';
    }

    html += `
      <div class="${classes}" onclick="selectAdminDate('${dateStr}')">
        ${d}
        ${dots ? `<div class="dot-indicator">${dots}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  card.innerHTML = html;
}

function adminPrevMonth() {
  adminCalMonth--;
  if (adminCalMonth < 0) { adminCalMonth = 11; adminCalYear--; }
  loadAdminDates();
}

function adminNextMonth() {
  adminCalMonth++;
  if (adminCalMonth > 11) { adminCalMonth = 0; adminCalYear++; }
  loadAdminDates();
}

function selectAdminDate(dateStr) {
  selectedAdminDate = dateStr;
  renderAdminCalendar();
  renderDayDetails(dateStr);
}

function renderDayDetails(dateStr) {
  const card = document.getElementById('day-details-card');
  const date = new Date(dateStr + 'T00:00:00');
  const dateData = adminDatesCache[dateStr];
  const isOpen = dateData ? dateData.is_open : false;
  const maxGuests = dateData ? dateData.max_guests : 45;
  const isSpecial = dateData ? dateData.is_special_event : false;

  const monthName = date.toLocaleDateString('en-US', { month: 'long' });
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dayNum = date.getDate().toString().padStart(2, '0');

  card.innerHTML = `
    <h3>
      Day Details
      <span class="today-badge">
        ${isToday(dateStr) ? 'TODAY' : ''}
      </span>
    </h3>

    <div class="day-display">
      <div class="day-display-month">${monthName}</div>
      <div class="day-display-date">${dayNum}</div>
      <div class="day-display-day">${dayName}</div>
    </div>

    <div class="day-detail-row">
      <div class="label-group">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div>
          <div class="label-text">Availability Status</div>
          <div class="label-sub">Currently ${isOpen ? 'accepting' : 'not accepting'} bookings</div>
        </div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" ${isOpen ? 'checked' : ''} onchange="toggleDateAvailability('${dateStr}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="day-detail-row">
      <div class="label-group">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <div>
          <div class="label-text">Reservation Limit</div>
          <div class="label-sub">Maximum ${maxGuests} guests</div>
        </div>
      </div>
      <button class="edit-link">Edit</button>
    </div>

    <div class="day-detail-row">
      <div class="label-group">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <div>
          <div class="label-text">Special Event</div>
        </div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" ${isSpecial ? 'checked' : ''} onchange="toggleSpecialEvent('${dateStr}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>

    <button class="btn btn-primary btn-block" style="margin-top:1.25rem;" onclick="applyDateChanges('${dateStr}')">Apply Changes to Date</button>
    <button class="btn btn-outline btn-block" style="margin-top:0.5rem;">View Bookings</button>
  `;
}

async function toggleDateAvailability(dateStr, isOpen) {
  try {
    await fetch(`${API_BASE}/manage-dates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ date: dateStr, is_open: isOpen }),
    });
    loadAdminDates();
  } catch {
    alert('Failed to update date.');
  }
}

async function toggleSpecialEvent(dateStr, isSpecial) {
  try {
    await fetch(`${API_BASE}/manage-dates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ date: dateStr, is_special_event: isSpecial }),
    });
    loadAdminDates();
  } catch {
    alert('Failed to update date.');
  }
}

async function applyDateChanges(dateStr) {
  const card = document.getElementById('day-details-card');
  const isOpen = card.querySelector('input[type="checkbox"]')?.checked || false;

  try {
    await fetch(`${API_BASE}/manage-dates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ date: dateStr, is_open: isOpen }),
    });
    loadAdminDates();
    selectAdminDate(dateStr);
  } catch {
    alert('Failed to save changes.');
  }
}

// ─── Utilities ────────────────────────────────────────────────
function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDates(dates) {
  try {
    const arr = typeof dates === 'string' ? JSON.parse(dates) : dates;
    if (!Array.isArray(arr)) return '—';
    return arr.map(d => {
      const parts = d.split('-');
      return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }).join(', ');
  } catch {
    return '—';
  }
}

function isToday(dateStr) {
  const today = new Date();
  return formatDateStr(today) === dateStr;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Loading...';
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}
