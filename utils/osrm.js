const http = require('http');

const OSRM_BASE = 'http://router.project-osrm.org';

// Restaurant reference coordinates (32 Swenson Dr, New Vineyard, ME 04956)
const RESTAURANT_COORDS = { lat: 44.8066, lon: -70.1182 };

const SERVICE_AREA_THRESHOLD_SECONDS = 3600; // 60 minutes

/**
 * Calculate driving time from pickup coordinates to the restaurant.
 * OSRM format: /route/v1/driving/{lon1},{lat1};{lon2},{lat2}
 */
async function calculateTravelTime(pickupLat, pickupLon) {
  const url = `${OSRM_BASE}/route/v1/driving/${pickupLon},${pickupLat};${RESTAURANT_COORDS.lon},${RESTAURANT_COORDS.lat}?overview=false`;

  const data = await fetchJSON(url);

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

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { 'User-Agent': 'RestaurantBookingTool/1.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Failed to parse routing response.'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Routing request timed out.')); });
  });
}

module.exports = { calculateTravelTime, SATELLITE_PARKING, RESTAURANT_COORDS };
