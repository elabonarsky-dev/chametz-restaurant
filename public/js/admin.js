/* ============================================================
   ADMIN PORTAL — CLIENT-SIDE LOGIC
   ============================================================ */

const API_BASE = '/api';
let adminToken = '';
let currentBookingId = '';
let currentBookingDetail = null;   // full booking + guests for invoice
let adminCalendarMonth, adminCalendarYear;
let selectedDate = null;
let bookingsData = [];
let adminDatesData = {};      // YYYY-MM-DD → DB row
let adminViewMode = 'month';  // 'month' | 'week'
let adminReservationLimit = 0; // synced from app_settings

// ─── Authentication ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = sessionStorage.getItem('admin_token');
  if (savedToken) {
    adminToken = savedToken;
    showApp();
  }
  
  const now = new Date();
  adminCalendarMonth = now.getMonth();
  adminCalendarYear = now.getFullYear();
  selectedDate = now;
  
  document.getElementById('admin-secret').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') authenticate();
  });

  // Search bar — filter bookings table as you type
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      renderBookingsTable(bookingsData);
      return;
    }
    const filtered = bookingsData.filter((b, index) => {
      const bookingNum = `bk-${index + 1}`;
      return (
        (b.pickup_address || '').toLowerCase().includes(q) ||
        (b.status || '').toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q) ||
        (b.phone || '').toLowerCase().includes(q) ||
        bookingNum.includes(q)
      );
    });
    renderBookingsTable(filtered);
  });

  // New Booking — opens the customer booking form in a new tab
  document.querySelector('.btn-new-booking').addEventListener('click', () => {
    window.open('/', '_blank');
  });

  // Month / Week view toggle — use data-view-mode so idx order doesn't matter
  document.querySelectorAll('.view-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const mode = this.dataset.viewMode || (this.textContent.trim().toLowerCase().startsWith('week') ? 'week' : 'month');
      adminViewMode = mode;
      document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      await fetchAdminDatesForMonth();
      renderAdminCalendar();
      updateDayDetails();
    });
  });

  // Special event toggle → show / hide notes input
  document.getElementById('special-event-toggle').addEventListener('change', function () {
    const wrap = document.getElementById('special-event-input-wrap');
    if (wrap) wrap.classList.toggle('hidden', !this.checked);
  });

  // Availability toggle → update live description text
  document.getElementById('availability-toggle').addEventListener('change', function () {
    const desc = document.getElementById('availability-desc');
    if (desc) desc.textContent = this.checked ? 'Currently accepting bookings' : 'Closed — toggle to open';
  });
});

async function authenticate() {
  const secret = document.getElementById('admin-secret').value.trim();
  const errorEl = document.getElementById('auth-error');
  
  if (!secret) {
    errorEl.textContent = 'Please enter the admin secret.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  showLoading('Authenticating...');
  
  try {
    const res = await fetch(`${API_BASE}/get-bookings?limit=1`, {
      headers: { 'Authorization': `Bearer ${secret}` },
    });
    
    hideLoading();
    
    if (res.status === 401) {
      errorEl.textContent = 'Invalid admin secret.';
      errorEl.classList.remove('hidden');
      return;
    }
    
    adminToken = secret;
    sessionStorage.setItem('admin_token', secret);
    showApp();
  } catch (err) {
    hideLoading();
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.remove('hidden');
  }
}

function showApp() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('admin-layout').classList.remove('hidden');
  loadBookings();
}

// ─── View Navigation ──────────────────────────────────────────
function showView(view, linkEl) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  
  document.querySelectorAll('.admin-nav-link').forEach(el => el.classList.remove('active'));
  if (linkEl) {
    linkEl.classList.add('active');
  } else {
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  }

  // Hide search/new-booking topbar on detail, dates, and settings views
  const topbar = document.querySelector('.admin-topbar');
  const hideTopbar = view === 'booking-details' || view === 'dates' || view === 'settings';
  if (topbar) topbar.style.display = hideTopbar ? 'none' : '';
  
  if (view === 'bookings') loadBookings();
  if (view === 'dates') loadDatesView();
  if (view === 'settings') loadSettings();
}

// ─── Bookings Dashboard ───────────────────────────────────────
async function loadBookings() {
  showLoading('Loading bookings...');
  
  try {
    const res = await fetch(`${API_BASE}/get-bookings?limit=50`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json();
    hideLoading();
    
    if (!res.ok) {
      alert(data.error || 'Failed to load bookings.');
      return;
    }
    
    bookingsData = data.bookings || [];
    updateStats(bookingsData);
    renderBookingsTable(bookingsData);
  } catch (err) {
    hideLoading();
    alert('Network error loading bookings.');
  }
}

function updateStats(bookings) {
  const total = bookings.length;
  const pending = bookings.filter(b => b.status === 'pending').length;
  const today = bookings.filter(b => {
    const created = new Date(b.created_at);
    const now = new Date();
    return created.toDateString() === now.toDateString();
  }).length;
  
  document.getElementById('stat-total').textContent = total.toLocaleString();
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-today').textContent = today;
}

function renderBookingsTable(bookings) {
  const tbody = document.getElementById('bookings-tbody');
  
  if (bookings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem; color: var(--c-text-muted);">
          No bookings found
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = bookings.map((b, index) => {
    const dates = Array.isArray(b.preferred_dates) ? b.preferred_dates[0] : '';
    const statusClass = `status-badge-${b.status}`;
    const createdDate = b.created_at ? formatAdminDate(b.created_at) : 'N/A';
    const bookingNum = index + 1;
    
    return `
      <tr>
        <td><a href="#" class="booking-id-link" onclick="viewBooking('${b.id}')">#BK-${bookingNum}</a></td>
        <td>${escapeHtml(b.pickup_address || 'N/A')}</td>
        <td>${formatAdminDate(dates)}</td>
        <td>${b.guest_count || 0}</td>
        <td><span class="status-badge ${statusClass}">${capitalizeFirst(b.status)}</span></td>
        <td>${createdDate}</td>
        <td>
          <div class="table-actions">
            <a href="#" class="action-link" onclick="viewBooking('${b.id}');return false;">View</a>
            <button class="btn-delete-booking" onclick="confirmDelete('${b.id}')" title="Delete booking">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('showing-count').textContent = bookings.length;
  document.getElementById('total-count').textContent = bookings.length;
  renderPagination(bookings.length);
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / 10) || 1;
  const pagination = document.getElementById('pagination');
  
  let html = `
    <button class="pagination-btn">‹</button>
    <button class="pagination-btn active">1</button>
  `;
  
  for (let i = 2; i <= Math.min(3, totalPages); i++) {
    html += `<button class="pagination-btn">${i}</button>`;
  }
  
  if (totalPages > 4) {
    html += `<span class="pagination-dots">...</span>`;
    html += `<button class="pagination-btn">${totalPages}</button>`;
  }
  
  html += `<button class="pagination-btn">›</button>`;
  pagination.innerHTML = html;
}

// ─── Booking Details ──────────────────────────────────────────
async function viewBooking(id) {
  currentBookingId = id;
  showLoading('Loading booking details...');
  
  try {
    const res = await fetch(`${API_BASE}/get-booking?id=${id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json();
    hideLoading();
    
    if (!res.ok) {
      alert(data.error || 'Failed to load booking.');
      return;
    }

    // Backend returns guests separately — merge into booking object
    const booking = { ...data.booking, guests: data.guests || [] };
    currentBookingDetail = booking;
    renderBookingDetails(booking);
    showView('booking-details');
  } catch (err) {
    hideLoading();
    alert('Network error loading booking.');
  }
}

function renderBookingDetails(booking) {
  const statusClass = `status-badge-${booking.status}`;
  document.getElementById('detail-status').className = `status-badge ${statusClass}`;
  document.getElementById('detail-status').textContent = capitalizeFirst(booking.status);
  
  const bookingIndex = bookingsData.findIndex(b => b.id === booking.id);
  const bookingNum = bookingIndex >= 0 ? bookingIndex + 1 : '—';
  document.getElementById('detail-booking-id').textContent = `#BK-${bookingNum}`;
  
  const guests = booking.guests || [];
  const primaryGuest = guests.find(g => g.is_primary) || guests[0];
  document.getElementById('detail-guest-name').textContent = primaryGuest?.name || booking.email || 'Unknown Guest';
  document.getElementById('detail-phone').textContent = booking.phone || 'No phone';
  document.getElementById('detail-email').textContent = booking.email || 'No email';
  
  const guestCount = guests.length;
  document.getElementById('detail-summary').textContent = `Reservation for ${guestCount} guest${guestCount !== 1 ? 's' : ''}`;
  
  document.getElementById('detail-address').textContent = booking.pickup_address || 'N/A';
  
  // Dates formatted as "Mar 18 2026" (no comma before year)
  const dates = Array.isArray(booking.preferred_dates)
    ? booking.preferred_dates.map(d => formatAdminDate(d)).join(', ')
    : 'N/A';
  document.getElementById('detail-dates').textContent = dates;

  // Confirmed / finalized date
  const confirmedEl = document.getElementById('detail-confirmed-date');
  if (confirmedEl) {
    confirmedEl.textContent = booking.confirmed_date
      ? formatAdminDate(booking.confirmed_date)
      : '—';
    confirmedEl.style.color = booking.confirmed_date ? 'var(--c-primary)' : 'var(--c-text-muted)';
  }

  document.getElementById('detail-deposit').textContent = `$${((booking.deposit_amount || 0) / 100).toFixed(2)}`;
  
  // Wire up Edit Booking button for this booking
  const editBtn = document.querySelector('.btn-edit-booking');
  if (editBtn) {
    editBtn.onclick = () => openEditModal(booking);
  }

  renderGuestList(guests);
}

function formatAdminDate(input) {
  if (!input) return 'N/A';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const str = String(input);
  let d;

  // Full ISO timestamp (has time component) → parse as Date so JS converts UTC → local time
  if (str.includes('T') || str.endsWith('Z') || str.includes('+')) {
    d = new Date(str);
  } else {
    // Date-only string "YYYY-MM-DD" → manual parse to avoid UTC-midnight timezone shift
    const parts = str.split('-');
    if (parts.length !== 3) return str;
    d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  if (isNaN(d.getTime())) return str;
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

// ─── Full Invoice Modal ───────────────────────────────────────
function openInvoiceModal() {
  const b = currentBookingDetail;
  if (!b) return;

  const existing = document.getElementById('invoice-modal');
  if (existing) existing.remove();

  const bookingIndex = bookingsData.findIndex(x => x.id === b.id);
  const bookingNum = bookingIndex >= 0 ? bookingIndex + 1 : '—';
  const ref = `#BK-${bookingNum}`;

  const guests = b.guests || [];
  const depositTotal = (b.deposit_amount || 0) / 100;
  const perGuest = guests.length > 0 ? depositTotal / guests.length : 50;
  const createdDate = b.created_at ? formatAdminDate(b.created_at) : 'N/A';

  const dates = Array.isArray(b.preferred_dates)
    ? b.preferred_dates.map(d => formatAdminDate(d)).join(', ')
    : 'N/A';

  const guestRows = guests.map((g, i) => `
    <tr class="inv-guest-row">
      <td>${escapeHtml(g.name)}${i === 0 ? ' <span class="inv-primary">Primary</span>' : ''}</td>
      <td>${formatBirthday(g.birthday)}</td>
      <td>${g.beverage_pairing === 'alcoholic' ? 'Alcoholic' : 'Non-alcoholic'}</td>
      <td>${g.allergies ? escapeHtml(g.allergies) : '—'}</td>
      <td class="inv-amount">$${perGuest.toFixed(2)}</td>
    </tr>
  `).join('');

  const modal = document.createElement('div');
  modal.id = 'invoice-modal';
  modal.className = 'invoice-overlay';
  modal.innerHTML = `
    <div class="invoice-card">
      <div class="invoice-actions">
        <button class="invoice-print-btn" onclick="window.print()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print Invoice
        </button>
        <button class="invoice-close-btn" onclick="closeInvoiceModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="invoice-body" id="invoice-printable">
        <div class="invoice-header">
          <div class="invoice-brand">
            <div class="invoice-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <div>
              <div class="invoice-brand-name">The Chametz Restaurant</div>
              <div class="invoice-brand-sub">Western Maine Mountains</div>
            </div>
          </div>
          <div class="invoice-meta">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-ref">${ref}</div>
            <div class="invoice-date">Date: ${createdDate}</div>
          </div>
        </div>

        <div class="invoice-section-grid">
          <div class="invoice-section">
            <div class="invoice-section-label">Bill To</div>
            <div class="invoice-section-value">${escapeHtml(guests[0]?.name || b.email || '—')}</div>
            ${b.phone ? `<div class="invoice-section-sub">${escapeHtml(b.phone)}</div>` : ''}
            ${b.email ? `<div class="invoice-section-sub">${escapeHtml(b.email)}</div>` : ''}
          </div>
          <div class="invoice-section">
            <div class="invoice-section-label">Pickup Address</div>
            <div class="invoice-section-value">${escapeHtml(b.pickup_address || '—')}</div>
          </div>
          <div class="invoice-section">
            <div class="invoice-section-label">Preferred Dates</div>
            <div class="invoice-section-value">${dates}</div>
          </div>
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>Guest Name</th>
              <th>Birthday</th>
              <th>Beverage</th>
              <th>Allergies</th>
              <th>Deposit</th>
            </tr>
          </thead>
          <tbody>${guestRows}</tbody>
        </table>

        <div class="invoice-totals">
          <div class="invoice-total-row">
            <span>Subtotal (${guests.length} guest${guests.length !== 1 ? 's' : ''} × $${perGuest.toFixed(2)})</span>
            <span>$${depositTotal.toFixed(2)}</span>
          </div>
          <div class="invoice-total-row invoice-grand-total">
            <span>Total Paid</span>
            <span>$${depositTotal.toFixed(2)}</span>
          </div>
        </div>

        <div class="invoice-footer">
          <div class="invoice-paid-stamp">✓ PAID</div>
          <div class="invoice-footer-note">Payment processed via Stripe · Ref: ${escapeHtml(b.stripe_payment_id || '—')}</div>
          <div class="invoice-footer-note">Deposit is non-refundable within 1 week of reservation.</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeInvoiceModal(); });
}

function closeInvoiceModal() {
  const modal = document.getElementById('invoice-modal');
  if (modal) modal.remove();
}

// ─── Edit Booking Modal ────────────────────────────────────────
// Module-level state for the edit modal date list
let _editDates = [];

function openEditModal(booking) {
  const existing = document.getElementById('edit-booking-modal');
  if (existing) existing.remove();

  // Build mutable dates list from booking
  _editDates = Array.isArray(booking.preferred_dates)
    ? [...booking.preferred_dates.map(d => String(d).split('T')[0])]
    : [];

  const statuses = ['pending', 'confirmed', 'cancelled', 'refunded'];
  const statusOptions = statuses.map(s =>
    `<option value="${s}" ${booking.status === s ? 'selected' : ''}>${capitalizeFirst(s)}</option>`
  ).join('');

  const guests = booking.guests || [];
  const primaryGuest = guests.find(g => g.is_primary) || guests[0] || {};

  const modal = document.createElement('div');
  modal.id = 'edit-booking-modal';
  modal.className = 'edit-modal-overlay';
  modal.innerHTML = `
    <div class="edit-modal-card">
      <div class="edit-modal-header">
        <h3 class="edit-modal-title">Edit Booking</h3>
        <button class="edit-modal-close" onclick="closeEditModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="edit-modal-body">

        <div class="edit-modal-section-title">Booking Status</div>
        <div class="form-group">
          <select class="form-input" id="edit-status-select">${statusOptions}</select>
        </div>

        <div class="edit-modal-section-title">Contact Information</div>
        <div class="edit-modal-row">
          <div class="form-group">
            <label class="form-label">Name (primary guest)</label>
            <input type="text" class="form-input" id="edit-guest-name"
              value="${(primaryGuest.name || '').replace(/"/g, '&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="edit-email"
              value="${(booking.email || '').replace(/"/g, '&quot;')}">
          </div>
        </div>
        <div class="edit-modal-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" class="form-input" id="edit-phone"
              value="${(booking.phone || '').replace(/"/g, '&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">Pickup Address</label>
            <input type="text" class="form-input" id="edit-address"
              value="${(booking.pickup_address || '').replace(/"/g, '&quot;')}">
          </div>
        </div>

        <div class="edit-modal-section-title">Preferred Dates</div>
        <div id="edit-dates-list" class="edit-dates-list"></div>
        <div class="edit-dates-add">
          <input type="date" class="form-input" id="edit-add-date-input">
          <button class="btn btn-outline btn-sm" onclick="editAddDate()">+ Add Date</button>
        </div>

        <div class="edit-modal-section-title" style="margin-top:1rem;">Confirmed / Finalized Date</div>
        <div class="form-group">
          <select class="form-input" id="edit-confirmed-date"></select>
          <p class="settings-field-hint">Select the single confirmed dining date from the preferred list, or leave blank.</p>
        </div>

      </div>
      <div class="edit-modal-footer">
        <button class="btn btn-outline" onclick="closeEditModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveBookingEdit('${booking.id}', '${primaryGuest.id || ''}')">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEditModal(); });

  // Render the dates list and confirmed-date select
  renderEditDatesList(booking.confirmed_date);
}

function renderEditDatesList(currentConfirmed) {
  const list = document.getElementById('edit-dates-list');
  const confirmSel = document.getElementById('edit-confirmed-date');
  if (!list || !confirmSel) return;

  list.innerHTML = _editDates.length === 0
    ? '<p style="font-size:0.8125rem;color:var(--c-text-muted);margin:0 0 0.5rem;">No dates added yet.</p>'
    : _editDates.map(d => `
        <div class="edit-date-chip">
          <span>${formatAdminDate(d)}</span>
          <button class="edit-date-remove" onclick="editRemoveDate('${d}')" title="Remove">×</button>
        </div>`).join('');

  const confirmedVal = currentConfirmed
    ? String(currentConfirmed).split('T')[0]
    : (confirmSel.value || '');

  confirmSel.innerHTML = '<option value="">— Not confirmed yet —</option>' +
    _editDates.map(d => {
      const sel = confirmedVal === d ? 'selected' : '';
      return `<option value="${d}" ${sel}>${formatAdminDate(d)}</option>`;
    }).join('');
}

function editAddDate() {
  const input = document.getElementById('edit-add-date-input');
  if (!input || !input.value) return;
  const val = input.value; // YYYY-MM-DD
  if (!_editDates.includes(val)) {
    _editDates.push(val);
    _editDates.sort();
    renderEditDatesList(null);
  }
  input.value = '';
}

function editRemoveDate(dateStr) {
  _editDates = _editDates.filter(d => d !== dateStr);
  const confirmSel = document.getElementById('edit-confirmed-date');
  const currentConfirmed = confirmSel ? confirmSel.value : null;
  renderEditDatesList(currentConfirmed === dateStr ? null : currentConfirmed);
}

function closeEditModal() {
  const modal = document.getElementById('edit-booking-modal');
  if (modal) modal.remove();
  _editDates = [];
}

async function saveBookingEdit(id, primaryGuestId) {
  const status        = document.getElementById('edit-status-select')?.value;
  const email         = document.getElementById('edit-email')?.value?.trim() || '';
  const phone         = document.getElementById('edit-phone')?.value?.trim() || '';
  const pickup        = document.getElementById('edit-address')?.value?.trim() || '';
  const guestName     = document.getElementById('edit-guest-name')?.value?.trim() || '';
  const confirmedDate = document.getElementById('edit-confirmed-date')?.value || '';

  const payload = {
    id,
    status,
    email,
    phone,
    pickup_address: pickup,
    preferred_dates: [..._editDates],
    confirmed_date: confirmedDate || null,
  };

  if (primaryGuestId && guestName) {
    payload.primary_guest = { id: primaryGuestId, name: guestName };
  }

  showLoading('Saving changes…');
  try {
    const res = await fetch(`${API_BASE}/update-booking`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });
    hideLoading();

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to update booking.');
      return;
    }

    closeEditModal();
    viewBooking(id);
    loadBookingsQuiet();
  } catch (err) {
    hideLoading();
    alert('Network error updating booking.');
  }
}

async function loadBookingsQuiet() {
  try {
    const res = await fetch(`${API_BASE}/get-bookings?limit=50`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      bookingsData = data.bookings || [];
    }
  } catch (_) {}
}

function formatBirthday(raw) {
  if (!raw) return 'N/A';
  // Handles "1983-11-30", "1983-11-30T00:00:00.000Z", etc.
  const iso = String(raw).split('T')[0];
  const parts = iso.split('-');
  if (parts.length !== 3) return raw;
  return `${parts[1].padStart(2,'0')}/${parts[2].padStart(2,'0')}/${parts[0]}`;
}

function renderGuestList(guests) {
  const container = document.getElementById('detail-guests-list');
  
  if (guests.length === 0) {
    container.innerHTML = '<p style="color: var(--c-text-muted); padding: 0.5rem 0;">No guests</p>';
    return;
  }
  
  container.innerHTML = guests.map((g, i) => {
    const initials = getInitials(g.name);
    const isPrimary = g.is_primary || i === 0;
    const avatarClass = i % 2 === 0 ? '' : 'alt';
    const birthday = formatBirthday(g.birthday);
    const pairing = g.beverage_pairing === 'alcoholic' ? 'Alcoholic' : 'Non-alcoholic';
    
    return `
      <div class="guest-list-item">
        <div class="guest-avatar ${avatarClass}">${initials}</div>
        <div class="guest-info">

          <div class="guest-name-col">
            <div class="guest-name-text">
              ${escapeHtml(g.name)}
              ${isPrimary ? '<span class="primary-badge">Primary</span>' : ''}
            </div>
            <div class="guest-birthday">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              </svg>
              ${birthday}
            </div>
          </div>

          <div class="guest-pairing-col">
            <div class="pairing-label">Pairing</div>
            <div class="pairing-value ${g.beverage_pairing === 'alcoholic' ? 'pairing-alcoholic' : 'pairing-non'}">${pairing}</div>
          </div>

          ${g.allergies ? `
          <div class="guest-allergy-col">
            <div class="guest-allergy">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              ${escapeHtml(g.allergies)}
            </div>
          </div>` : '<div class="guest-allergy-col"></div>'}

        </div>
      </div>
    `;
  }).join('');
}

async function confirmDelete(id) {
  if (!confirm('Are you sure you want to delete this booking?')) return;
  
  showLoading('Deleting booking...');
  
  try {
    // Backend reads id from query string, not request body
    const res = await fetch(`${API_BASE}/delete-booking?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    
    hideLoading();
    
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete booking.');
      return;
    }
    
    loadBookings();
  } catch (err) {
    hideLoading();
    alert('Network error deleting booking.');
  }
}

// ─── Dining Schedule ──────────────────────────────────────────
async function loadDatesView() {
  await fetchAdminDatesForMonth();
  renderAdminCalendar();
  updateDayDetails();
}

async function fetchAdminDatesForMonth() {
  try {
    const res = await fetch(
      `${API_BASE}/manage-dates?month=${adminCalendarMonth + 1}&year=${adminCalendarYear}`,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      adminDatesData = {};
      (data.dates || []).forEach(d => {
        const key = (d.date || '').split('T')[0];
        if (key) adminDatesData[key] = d;
      });
      // Sync the global default limit returned by the API
      if (data.default_limit) adminReservationLimit = data.default_limit;
    }
  } catch (e) { /* silent */ }
}

function renderAdminCalendar() {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const grid = document.getElementById('admin-calendar-grid');
  const today = new Date();

  if (adminViewMode === 'week') {
    const base = selectedDate || today;
    const startOfWeek = new Date(base);
    startOfWeek.setDate(base.getDate() - base.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const fmtShort = (d) => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };
    const title = startOfWeek.getMonth() === endOfWeek.getMonth()
      ? `${monthNames[startOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`
      : `${fmtShort(startOfWeek)} – ${fmtShort(endOfWeek)} ${endOfWeek.getFullYear()}`;
    document.getElementById('admin-calendar-title').textContent = title;

    // Week view: show day name inside each cell, no separate DOW row
    let html = '';
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      html += buildDayCell(date, today, true);
    }
    grid.innerHTML = html;
  } else {
    document.getElementById('admin-calendar-title').textContent = `${monthNames[adminCalendarMonth]} ${adminCalendarYear}`;
    const daysInMonth = new Date(adminCalendarYear, adminCalendarMonth + 1, 0).getDate();
    const firstDow = new Date(adminCalendarYear, adminCalendarMonth, 1).getDay();

    let html = dows.map(d => `<div class="schedule-dow">${d}</div>`).join('');
    for (let i = 0; i < firstDow; i++) html += '<div class="schedule-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      html += buildDayCell(new Date(adminCalendarYear, adminCalendarMonth, d), today);
    }
    grid.innerHTML = html;
  }
}

function buildDayCell(date, today, showDayName = false) {
  const dateStr = formatDateISO(date);
  const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
  const dateInfo = adminDatesData[dateStr];
  const isClosed = dateInfo ? !dateInfo.is_open : true; // default: closed until explicitly opened
  const isSpecial = dateInfo?.is_special_event;

  let classes = 'schedule-day';
  if (isSelected) classes += ' selected';
  if (isClosed) classes += ' closed';
  if (isSpecial) classes += ' special-event-day';

  const dotHtml = !isClosed
    ? `<span class="dot${isSpecial ? ' dot-special' : ''}"></span>`
    : '';

  const dayAbbrs = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayLabel = showDayName
    ? `<span class="schedule-day-name">${dayAbbrs[date.getDay()]}</span>`
    : '';

  // Booked count from loaded bookings (exclude cancelled/refunded)
  const bookedCount = bookingsData.filter(b =>
    Array.isArray(b.preferred_dates) &&
    b.preferred_dates.some(d => String(d).split('T')[0] === dateStr) &&
    !['cancelled', 'refunded'].includes(b.status)
  ).length;
  const limit = dateInfo?.max_guests || adminReservationLimit || 0;
  const isFullyBooked = !isClosed && bookedCount >= limit;
  const pct = limit > 0 ? bookedCount / limit : 0;
  const cClass = pct >= 1 ? 'counter-full' : pct >= 0.8 ? 'counter-high' : pct >= 0.5 ? 'counter-mid' : 'counter-low';
  const counterHtml = `<span class="cell-counter ${cClass}">${bookedCount}/${limit}</span>`;

  if (isFullyBooked) classes += ' fully-booked';

  return `
    <div class="${classes}" onclick="selectDate(${date.getFullYear()},${date.getMonth()},${date.getDate()})">
      ${counterHtml}
      ${dayLabel}
      <span>${date.getDate()}</span>
      ${dotHtml}
    </div>
  `;
}

function selectDate(year, month, day) {
  selectedDate = new Date(year, month, day);
  adminCalendarMonth = month;
  adminCalendarYear = year;
  renderAdminCalendar();
  updateDayDetails();
}

function updateDayDetails() {
  if (!selectedDate) return;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  document.getElementById('selected-month').textContent = monthNames[selectedDate.getMonth()];
  document.getElementById('selected-day').textContent = String(selectedDate.getDate()).padStart(2, '0');
  document.getElementById('selected-weekday').textContent = dayNames[selectedDate.getDay()];

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  document.getElementById('today-badge').style.display = isToday ? 'inline-block' : 'none';

  const dateStr = formatDateISO(selectedDate);
  const dateInfo = adminDatesData[dateStr];

  // Availability toggle (default: closed — admin must explicitly open dates)
  const isOpen = dateInfo ? dateInfo.is_open : false;
  document.getElementById('availability-toggle').checked = isOpen;
  const availDesc = document.getElementById('availability-desc');
  if (availDesc) availDesc.textContent = isOpen ? 'Currently accepting bookings' : 'Closed — toggle to open';

  // Special event toggle + notes
  const isSpecial = dateInfo?.is_special_event || false;
  document.getElementById('special-event-toggle').checked = isSpecial;
  const notesWrap = document.getElementById('special-event-input-wrap');
  const notesInput = document.getElementById('special-event-notes');
  if (notesWrap) notesWrap.classList.toggle('hidden', !isSpecial);
  if (notesInput) notesInput.value = dateInfo?.notes || '';

  // Reservation limit for this date
  const limit = dateInfo?.max_guests || adminReservationLimit || 0;
  const bookedCount = bookingsData.filter(b =>
    Array.isArray(b.preferred_dates) &&
    b.preferred_dates.some(d => String(d).split('T')[0] === dateStr) &&
    !['cancelled', 'refunded'].includes(b.status)
  ).length;

  const limitText = document.getElementById('detail-limit-text');
  const limitInput = document.getElementById('detail-limit-input');
  const limitEditWrap = document.getElementById('detail-limit-edit-wrap');
  const limitEditBtn = document.getElementById('detail-limit-edit-btn');
  if (limitText) limitText.textContent = `Maximum ${limit} guests · ${bookedCount} booked`;
  if (limitInput) limitInput.value = limit;
  if (limitEditWrap) limitEditWrap.classList.add('hidden');
  if (limitEditBtn) limitEditBtn.textContent = 'Edit';

  document.getElementById('day-booking-count').textContent = bookedCount;
}

function toggleLimitEdit() {
  const wrap = document.getElementById('detail-limit-edit-wrap');
  const btn = document.getElementById('detail-limit-edit-btn');
  if (!wrap) return;
  const isHidden = wrap.classList.contains('hidden');
  wrap.classList.toggle('hidden', !isHidden);
  if (btn) btn.textContent = isHidden ? 'Cancel' : 'Edit';
  if (isHidden) {
    const input = document.getElementById('detail-limit-input');
    if (input) input.focus();
  }
}

async function adminPrevMonth() {
  if (adminViewMode === 'week') {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    base.setDate(base.getDate() - 7);
    selectedDate = base;
    adminCalendarMonth = base.getMonth();
    adminCalendarYear = base.getFullYear();
  } else {
    adminCalendarMonth--;
    if (adminCalendarMonth < 0) { adminCalendarMonth = 11; adminCalendarYear--; }
  }
  await fetchAdminDatesForMonth();
  renderAdminCalendar();
  updateDayDetails();
}

async function adminNextMonth() {
  if (adminViewMode === 'week') {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    base.setDate(base.getDate() + 7);
    selectedDate = base;
    adminCalendarMonth = base.getMonth();
    adminCalendarYear = base.getFullYear();
  } else {
    adminCalendarMonth++;
    if (adminCalendarMonth > 11) { adminCalendarMonth = 0; adminCalendarYear++; }
  }
  await fetchAdminDatesForMonth();
  renderAdminCalendar();
  updateDayDetails();
}

async function applyDateChanges() {
  if (!selectedDate) return;

  const isOpen = document.getElementById('availability-toggle').checked;
  const isSpecial = document.getElementById('special-event-toggle').checked;
  const notes = isSpecial ? (document.getElementById('special-event-notes')?.value || '') : '';
  const dateStr = formatDateISO(selectedDate);

  // Always use the limit input as source of truth — updateDayDetails() keeps it in sync
  // with the current per-day value so the Edit toggle is only a UX affordance, not a gate.
  const limitInput = document.getElementById('detail-limit-input');
  const currentInfo = adminDatesData[dateStr];
  const fallback = currentInfo?.max_guests || adminReservationLimit || 0;
  const parsedLimit = limitInput ? parseInt(limitInput.value, 10) : NaN;
  const maxGuests = parsedLimit > 0 ? parsedLimit : fallback;

  const btn = document.querySelector('.btn-apply');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${API_BASE}/manage-dates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ date: dateStr, is_open: isOpen, is_special_event: isSpecial, notes, max_guests: maxGuests }),
    });

    if (res.ok) {
      const data = await res.json();
      // Store using the normalized YYYY-MM-DD key so buildDayCell can find it
      adminDatesData[dateStr] = data.date;
      renderAdminCalendar();
      updateDayDetails();
      if (btn) {
        btn.textContent = '✓ Saved';
        btn.style.background = '#059669';
        btn.style.color = '#fff';
        setTimeout(() => {
          btn.textContent = 'Apply Changes to Date';
          btn.style.background = '';
          btn.style.color = '';
          btn.disabled = false;
        }, 1800);
      }
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Failed to save.');
      if (btn) { btn.disabled = false; btn.textContent = 'Apply Changes to Date'; }
    }
  } catch (err) {
    alert('Error saving date settings.');
    if (btn) { btn.disabled = false; btn.textContent = 'Apply Changes to Date'; }
  }
}

function viewBookingsForDate() {
  if (!selectedDate) return;
  const dateStr = formatDateISO(selectedDate);
  const filtered = bookingsData.filter(b =>
    Array.isArray(b.preferred_dates) &&
    b.preferred_dates.some(d => String(d).startsWith(dateStr))
  );
  // Switch to bookings view without triggering the auto-reload in showView(),
  // so the filtered result isn't overwritten by a fresh API fetch.
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('view-bookings').classList.remove('hidden');
  document.querySelectorAll('.admin-nav-link').forEach(el => el.classList.remove('active'));
  document.querySelector('[data-view="bookings"]')?.classList.add('active');
  const topbar = document.querySelector('.admin-topbar');
  if (topbar) topbar.style.display = '';
  renderBookingsTable(filtered);
}

async function resetMonthToOpen() {
  const closedKeys = Object.keys(adminDatesData).filter(k => adminDatesData[k] && !adminDatesData[k].is_open);
  if (closedKeys.length === 0) {
    alert('No closed dates found in this month.');
    return;
  }
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (!confirm(`Re-open all ${closedKeys.length} closed date(s) in ${monthNames[adminCalendarMonth]} ${adminCalendarYear}?`)) return;

  showLoading('Resetting dates…');
  try {
    for (const dateStr of closedKeys) {
      const existing = adminDatesData[dateStr];
      await fetch(`${API_BASE}/manage-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          date: dateStr,
          is_open: true,
          is_special_event: existing?.is_special_event || false,
          notes: existing?.notes || '',
        }),
      });
    }
    hideLoading();
    await fetchAdminDatesForMonth();
    renderAdminCalendar();
    updateDayDetails();
  } catch (err) {
    hideLoading();
    alert('Error resetting dates.');
  }
}

// ─── Settings ─────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/manage-settings`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const s = data.settings || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    set('setting-venue-name',         s.venue_name         || '');
    set('setting-address',            s.venue_address      || '');
    set('setting-email',              s.contact_email      || '');
    set('setting-phone',              s.contact_phone      || '');
    set('setting-reservation-limit',  s.reservation_limit  || '');
  } catch (_) {}
}

async function saveVenueSettings() {
  const get = (id) => (document.getElementById(id)?.value || '').trim();
  const limit = parseInt(get('setting-reservation-limit'), 10);

  if (get('setting-venue-name') === '') {
    showSettingsMsg('venue-save-msg', 'Venue name is required.', 'error');
    return;
  }
  if (isNaN(limit) || limit < 1) {
    showSettingsMsg('venue-save-msg', 'Reservation limit must be a positive number.', 'error');
    return;
  }

  showLoading('Saving venue settings…');
  try {
    const res = await fetch(`${API_BASE}/manage-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        settings: {
          venue_name:        get('setting-venue-name'),
          venue_address:     get('setting-address'),
          contact_email:     get('setting-email'),
          contact_phone:     get('setting-phone'),
          reservation_limit: String(limit),
        },
      }),
    });
    hideLoading();
    if (res.ok) {
      showSettingsMsg('venue-save-msg', '✓ Venue settings saved.', 'success');
    } else {
      const d = await res.json().catch(() => ({}));
      showSettingsMsg('venue-save-msg', d.error || 'Failed to save.', 'error');
    }
  } catch (err) {
    hideLoading();
    showSettingsMsg('venue-save-msg', 'Network error. Please try again.', 'error');
  }
}

async function savePassword() {
  const current  = (document.getElementById('setting-current-password')?.value  || '').trim();
  const newPw    = (document.getElementById('setting-new-password')?.value       || '').trim();
  const confirm  = (document.getElementById('setting-confirm-password')?.value   || '').trim();

  if (!current) {
    showSettingsMsg('password-save-msg', 'Please enter your current password.', 'error');
    return;
  }
  if (current !== adminToken) {
    showSettingsMsg('password-save-msg', 'Current password is incorrect.', 'error');
    return;
  }
  if (!newPw || newPw.length < 6) {
    showSettingsMsg('password-save-msg', 'New password must be at least 6 characters.', 'error');
    return;
  }
  if (newPw !== confirm) {
    showSettingsMsg('password-save-msg', 'Passwords do not match.', 'error');
    return;
  }

  showLoading('Updating password…');
  try {
    const res = await fetch(`${API_BASE}/manage-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ settings: { admin_password: newPw } }),
    });
    hideLoading();
    if (res.ok) {
      // Update the in-memory token so admin stays logged in with new password
      adminToken = newPw;
      sessionStorage.setItem('admin_token', newPw);
      document.getElementById('setting-current-password').value = '';
      document.getElementById('setting-new-password').value = '';
      document.getElementById('setting-confirm-password').value = '';
      showSettingsMsg('password-save-msg', '✓ Password updated successfully.', 'success');
    } else {
      const d = await res.json().catch(() => ({}));
      showSettingsMsg('password-save-msg', d.error || 'Failed to update password.', 'error');
    }
  } catch (err) {
    hideLoading();
    showSettingsMsg('password-save-msg', 'Network error. Please try again.', 'error');
  }
}

function showSettingsMsg(elId, text, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = `settings-save-msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─── Utilities ────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
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
