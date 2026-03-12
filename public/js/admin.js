/* ============================================================
   ADMIN PORTAL — CLIENT-SIDE LOGIC
   ============================================================ */

const API_BASE = '/api';
let adminToken = '';
let currentBookingId = '';
let adminCalendarMonth, adminCalendarYear;

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
  if (linkEl) linkEl.classList.add('active');
  
  if (view === 'bookings') loadBookings();
  if (view === 'dates') loadDates();
}

// ─── Bookings ─────────────────────────────────────────────────
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
    
    renderBookings(data.bookings || []);
  } catch (err) {
    hideLoading();
    alert('Network error loading bookings.');
  }
}

function renderBookings(bookings) {
  const tbody = document.getElementById('bookings-tbody');
  const empty = document.getElementById('bookings-empty');
  
  if (bookings.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  
  tbody.innerHTML = bookings.map(b => {
    const dates = Array.isArray(b.preferred_dates) 
      ? b.preferred_dates.slice(0, 2).join(', ') 
      : '';
    const statusClass = `status-badge-${b.status}`;
    
    return `
      <tr onclick="viewBooking('${b.id}')">
        <td><strong>${escapeHtml(b.phone || 'N/A')}</strong></td>
        <td>${escapeHtml(b.phone || 'N/A')}</td>
        <td>${escapeHtml(dates)}</td>
        <td>${b.guest_count || 0}</td>
        <td><span class="status-badge ${statusClass}">${b.status}</span></td>
        <td>$${((b.deposit_amount || 0) / 100).toFixed(2)}</td>
        <td>
          <button class="btn-icon" onclick="event.stopPropagation(); viewBooking('${b.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

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
  document.getElementById('detail-status').textContent = booking.status;
  
  document.getElementById('detail-address').textContent = booking.pickup_address || 'N/A';
  document.getElementById('detail-travel').textContent = `${booking.travel_time_minutes || 0} minutes`;
  document.getElementById('detail-satellite').textContent = booking.satellite_confirmation ? 'Yes' : 'No';
  
  const dates = Array.isArray(booking.preferred_dates) ? booking.preferred_dates.join(', ') : 'N/A';
  document.getElementById('detail-dates').textContent = dates;
  document.getElementById('detail-phone').textContent = booking.phone || 'N/A';
  document.getElementById('detail-email').textContent = booking.email || 'N/A';
  
  const guests = booking.guests || [];
  document.getElementById('detail-guest-count').textContent = `${guests.length} guest${guests.length !== 1 ? 's' : ''}`;
  
  document.getElementById('detail-guests').innerHTML = guests.map(g => `
    <tr>
      <td>${escapeHtml(g.name)}</td>
      <td>${escapeHtml(g.birthday)}</td>
      <td>${g.beverage_pairing === 'alcoholic' ? '🍷 Alcoholic' : '🥤 Non-alcoholic'}</td>
      <td>${escapeHtml(g.allergies) || 'None'}</td>
    </tr>
  `).join('');
  
  document.getElementById('detail-deposit').textContent = `$${((booking.deposit_amount || 0) / 100).toFixed(2)}`;
  document.getElementById('detail-payment-id').textContent = booking.stripe_payment_id || 'N/A';
}

async function updateBookingStatus(status) {
  if (!currentBookingId) return;
  
  showLoading('Updating booking...');
  
  try {
    const res = await fetch(`${API_BASE}/update-booking`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ id: currentBookingId, status }),
    });
    
    hideLoading();
    
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to update booking.');
      return;
    }
    
    viewBooking(currentBookingId);
  } catch (err) {
    hideLoading();
    alert('Network error updating booking.');
  }
}

async function deleteBooking() {
  if (!currentBookingId) return;
  if (!confirm('Are you sure you want to delete this booking?')) return;
  
  showLoading('Deleting booking...');
  
  try {
    const res = await fetch(`${API_BASE}/delete-booking`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ id: currentBookingId }),
    });
    
    hideLoading();
    
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete booking.');
      return;
    }
    
    showView('bookings');
  } catch (err) {
    hideLoading();
    alert('Network error deleting booking.');
  }
}

// ─── Dates Management ─────────────────────────────────────────
async function loadDates() {
  renderAdminCalendar();
  
  try {
    const res = await fetch(`${API_BASE}/manage-dates`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json();
    
    if (res.ok) {
      renderDatesList(data.dates || []);
    }
  } catch (err) {
    console.error('Error loading dates:', err);
  }
}

function renderAdminCalendar() {
  const cal = document.getElementById('admin-calendar');
  const daysInMonth = new Date(adminCalendarYear, adminCalendarMonth + 1, 0).getDate();
  const firstDow = new Date(adminCalendarYear, adminCalendarMonth, 1).getDay();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let html = `
    <div class="calendar-header">
      <button class="calendar-nav" onclick="adminPrevMonth()">‹</button>
      <div class="calendar-title">${monthNames[adminCalendarMonth]} ${adminCalendarYear}</div>
      <button class="calendar-nav" onclick="adminNextMonth()">›</button>
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
    const date = new Date(adminCalendarYear, adminCalendarMonth, d);
    const dateStr = formatDate(date);
    html += `<div class="calendar-day" onclick="toggleDateStatus('${dateStr}')">${d}</div>`;
  }

  html += '</div>';
  cal.innerHTML = html;
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

async function toggleDateStatus(dateStr) {
  try {
    const res = await fetch(`${API_BASE}/manage-dates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ date: dateStr, is_open: true }),
    });
    
    if (res.ok) {
      loadDates();
    }
  } catch (err) {
    console.error('Error toggling date:', err);
  }
}

function renderDatesList(dates) {
  const list = document.getElementById('dates-list');
  
  if (dates.length === 0) {
    list.innerHTML = '<p class="empty-state">No dates configured. Click on calendar dates to add them.</p>';
    return;
  }
  
  list.innerHTML = dates.map(d => `
    <div class="setting-item">
      <div>
        <div class="setting-label">${d.date}</div>
      </div>
      <span class="status-badge ${d.is_open ? 'status-badge-confirmed' : 'status-badge-cancelled'}">
        ${d.is_open ? 'Open' : 'Closed'}
      </span>
    </div>
  `).join('');
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

function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Loading...';
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}
