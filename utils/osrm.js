/**
 * Public OSRM demo — must use HTTPS. Plain HTTP often hangs or fails from serverless
 * (redirects not followed, port 443 vs 80 reliability).
 */
const OSRM_BASE = 'https://router.project-osrm.org';

// Restaurant reference coordinates (32 Swenson Dr, New Vineyard, ME 04956)
const RESTAURANT_COORDS = { lat: 44.8066, lon: -70.1182 };

const SERVICE_AREA_THRESHOLD_SECONDS = 3600; // 60 minutes

// Keep total worst-case under Netlify's function limit (26s): 2 × 12s + backoff
const OSRM_ATTEMPTS = 2;
const OSRM_ATTEMPT_TIMEOUT_MS = 12000;

/**
 * Calculate driving time from pickup coordinates to the restaurant.
 * OSRM format: /route/v1/driving/{lon1},{lat1};{lon2},{lat2}
 */
async function calculateTravelTime(pickupLat, pickupLon) {
  const url = `${OSRM_BASE}/route/v1/driving/${pickupLon},${pickupLat};${RESTAURANT_COORDS.lon},${RESTAURANT_COORDS.lat}?overview=false`;

  const data = await fetchOsrmJson(url);

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Could not calculate driving route. Please verify your address.');
  }

  const durationSeconds = data.routes[0].duration;
  const durationMinutes = Math.round(durationSeconds / 60);
  const withinServiceArea = durationSeconds <= SERVICE_AREA_THRESHOLD_SECONDS;

  return {
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    within_service_area: withinServiceArea,
    distance_meters: data.routes[0].distance,
  };
}

/**
 * Satellite parking location shown to guests outside the service area.
 */
const SATELLITE_PARKING = {
  name: 'Satellite Parking Lot',
  address: '1798 New Vineyard Road',
  city: 'New Vineyard',
  state: 'Maine',
};

async function fetchOsrmJson(url) {
  let lastError = new Error('Routing request failed.');
  for (let attempt = 1; attempt <= OSRM_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RestaurantBookingTool/1.0 (contact: info@thechametz.com)',
        },
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`OSRM responded with ${res.status}`);
      }
      const data = await res.json();
      return data;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      lastError = new Error(isAbort ? 'Routing request timed out.' : (err.message || 'Routing request failed.'));
      if (attempt < OSRM_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastError;
}

module.exports = { calculateTravelTime, SATELLITE_PARKING, RESTAURANT_COORDS };
