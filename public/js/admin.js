/* ============================================================
   ADMIN PORTAL — CLIENT-SIDE LOGIC
   ============================================================ */

const API_BASE = '/api';
let adminToken = '';
let currentBookingId = '';
let adminCalendarMonth, adminCalendarYear;
let selectedDate = null;
let bookingsData = [];

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
  
  if (view === 'bookings') loadBookings();
  if (view === 'dates') loadDatesView();
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
    const dates = Array.isArray(b.preferred_dates) 
      ? b.preferred_dates[0] 
      : '';
    const statusClass = `status-badge-${b.status}`;
    const createdDate = b.created_at ? new Date(b.created_at).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    }) : 'N/A';
    const bookingNum = 8821 + index;
    
    return `
      <tr>
        <td><a href="#" class="booking-id-link" onclick="viewBooking('${b.id}')">#BK-${bookingNum}</a></td>
        <td>${escapeHtml(b.pickup_address || 'N/A')}</td>
        <td>${formatDate(dates)}</td>
        <td>${b.guest_count || 0}</td>
        <td><span class="status-badge ${statusClass}">${capitalizeFirst(b.status)}</span></td>
        <td>${createdDate}</td>
        <td>
          <div class="table-actions">
            <a href="#" class="action-link" onclick="viewBooking('${b.id}')">View</a>
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="confirmDelete('${b.id}')">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
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
    
    renderBookingDetails(data.booking);
    showView('booking-details');
  } catch (err) {
    hideLoading();
    alert('Network error loading booking.');
  }
}

function renderBookingDetails(booking) {
  const statusClass = `status-badge-${booking.status}`;
  document.getElementById('detail-status').className = `status-badge ${statusClass}`;
  document.getElementById('detail-status').textContent = booking.status.toUpperCase();
  
  const bookingIndex = bookingsData.findIndex(b => b.id === booking.id);
  const bookingNum = 8842 + bookingIndex;
  document.getElementById('detail-booking-id').textContent = `#${bookingNum}`;
  
  const primaryGuest = booking.guests?.[0];
  document.getElementById('detail-guest-name').textContent = primaryGuest?.name || 'Guest';
  document.getElementById('detail-phone').textContent = booking.phone || 'No phone';
  document.getElementById('detail-email').textContent = booking.email || 'No email';
  
  const guestCount = booking.guests?.length || 0;
  document.getElementById('detail-summary').textContent = `Reservation for ${guestCount} guest${guestCount !== 1 ? 's' : ''}`;
  
  document.getElementById('detail-address').textContent = booking.pickup_address || 'N/A';
  
  const dates = Array.isArray(booking.preferred_dates) 
    ? booking.preferred_dates.map(d => formatDate(d)).join(', ') 
    : 'N/A';
  document.getElementById('detail-dates').textContent = dates;
  
  document.getElementById('detail-deposit').textContent = `$${((booking.deposit_amount || 0) / 100).toFixed(2)}`;
  
  renderGuestList(booking.guests || []);
}

function renderGuestList(guests) {
  const container = document.getElementById('detail-guests-list');
  
  if (guests.length === 0) {
    container.innerHTML = '<p style="color: var(--c-text-muted);">No guests</p>';
    return;
  }
  
  container.innerHTML = guests.map((g, i) => {
    const initials = getInitials(g.name);
    const isPrimary = i === 0;
    const avatarClass = i % 2 === 0 ? '' : 'alt';
    
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              </svg>
              ${g.birthday || 'N/A'}
            </div>
          </div>
          <div class="guest-pairing">
            <div class="pairing-label">Pairing</div>
            <div class="pairing-value">${g.beverage_pairing === 'alcoholic' ? 'Alcoholic' : 'Non-alcoholic'}</div>
          </div>
          ${g.allergies ? `
            <div class="guest-allergy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              ${escapeHtml(g.allergies)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function confirmDelete(id) {
  if (!confirm('Are you sure you want to delete this booking?')) return;
  
  showLoading('Deleting booking...');
  
  try {
    const res = await fetch(`${API_BASE}/delete-booking`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ id }),
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
function loadDatesView() {
  renderAdminCalendar();
  updateDayDetails();
}

function renderAdminCalendar() {
  const daysInMonth = new Date(adminCalendarYear, adminCalendarMonth + 1, 0).getDate();
  const firstDow = new Date(adminCalendarYear, adminCalendarMonth, 1).getDay();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  
  document.getElementById('admin-calendar-title').textContent = `${monthNames[adminCalendarMonth]} ${adminCalendarYear}`;
  
  const grid = document.getElementById('admin-calendar-grid');
  const dows = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  
  let html = dows.map(d => `<div class="schedule-dow">${d}</div>`).join('');
  
  for (let i = 0; i < firstDow; i++) {
    html += '<div class="schedule-day"></div>';
  }
  
  const today = new Date();
  
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(adminCalendarYear, adminCalendarMonth, d);
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
    const isTuesday = date.getDay() === 2;
    
    let classes = 'schedule-day';
    if (isSelected) classes += ' selected';
    if (isTuesday) classes += ' closed';
    
    html += `
      <div class="${classes}" onclick="selectDate(${adminCalendarYear}, ${adminCalendarMonth}, ${d})">
        ${d}
        ${!isTuesday ? '<span class="dot"></span>' : ''}
      </div>
    `;
  }
  
  grid.innerHTML = html;
}

function selectDate(year, month, day) {
  selectedDate = new Date(year, month, day);
  renderAdminCalendar();
  updateDayDetails();
}

function updateDayDetails() {
  if (!selectedDate) return;
  
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  document.getElementById('selected-month').textContent = monthNames[selectedDate.getMonth()];
  document.getElementById('selected-day').textContent = String(selectedDate.getDate()).padStart(2, '0');
  document.getElementById('selected-weekday').textContent = dayNames[selectedDate.getDay()];
  
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  document.getElementById('today-badge').style.display = isToday ? 'inline-block' : 'none';
  
  const isTuesday = selectedDate.getDay() === 2;
  document.getElementById('availability-toggle').checked = !isTuesday;
}

function adminPrevMonth() {
  adminCalendarMonth--;
  if (adminCalendarMonth < 0) { adminCalendarMonth = 11; adminCalendarYear--; }
  renderAdminCalendar();
}

function adminNextMonth() {
  adminCalendarMonth++;
  if (adminCalendarMonth > 11) { adminCalendarMonth = 0; adminCalendarYear++; }
  renderAdminCalendar();
}

async function applyDateChanges() {
  if (!selectedDate) return;
  
  const isOpen = document.getElementById('availability-toggle').checked;
  const dateStr = formatDateISO(selectedDate);
  
  try {
    const res = await fetch(`${API_BASE}/manage-dates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ date: dateStr, is_open: isOpen }),
    });
    
    if (res.ok) {
      alert('Date settings saved!');
    }
  } catch (err) {
    alert('Error saving date settings.');
  }
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
