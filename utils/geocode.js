const https = require('https');

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

/**
 * Convert a street address to latitude/longitude using Nominatim.
 * Returns { lat, lon } or throws if the address cannot be resolved.
 */
async function geocodeAddress(address) {
  if (!address || typeof address !== 'string' || address.trim().length < 5) {
    throw new Error('A valid street address is required.');
  }

  const encoded = encodeURIComponent(address.trim());
  const url = `${NOMINATIM_BASE}/search?format=json&limit=1&q=${encoded}`;

  const data = await fetchJSON(url);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('ADDRESS_NOT_FOUND');
  }

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display_name: data[0].display_name,
  };
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'RestaurantBookingTool/1.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Failed to parse geocoding response.'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Geocoding request timed out.')); });
  });
}

module.exports = { geocodeAddress };
