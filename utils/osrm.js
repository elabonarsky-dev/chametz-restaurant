// Restaurant reference coordinates (32 Swenson Dr, New Vineyard, ME 04956)
const RESTAURANT_COORDS = { lat: 44.8066, lon: -70.1182 };

const SERVICE_AREA_THRESHOLD_SECONDS = 3600; // 60 minutes

/**
 * Approximate road distance from great-circle distance (rural / winding roads).
 * Tuned for Western Maine so typical in-area addresses stay inside the 1h rule.
 */
const ROAD_FACTOR = 1.42;

/** Average driving speed for time estimate (~39 km/h — conservative for mountain roads). */
const AVG_SPEED_MS = 10.8;

const OSRM_ATTEMPT_TIMEOUT_MS = 8000;

/**
 * Great-circle distance in meters (WGS84 sphere).
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const sΔφ = Math.sin(Δφ / 2);
  const sΔλ = Math.sin(Δλ / 2);
  const a = sΔφ * sΔφ + Math.cos(φ1) * Math.cos(φ2) * sΔλ * sΔλ;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

function estimateTravelFromHaversine(pickupLat, pickupLon) {
  const crowM = haversineMeters(
    pickupLat,
    pickupLon,
    RESTAURANT_COORDS.lat,
    RESTAURANT_COORDS.lon
  );
  const roadM = crowM * ROAD_FACTOR;
  const durationSeconds = roadM / AVG_SPEED_MS;
  const durationMinutes = Math.round(durationSeconds / 60);
  const withinServiceArea = durationSeconds <= SERVICE_AREA_THRESHOLD_SECONDS;

  return {
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    within_service_area: withinServiceArea,
    distance_meters: roadM,
  };
}

/**
 * Optional: real routing when OSRM_URL is set (e.g. self-hosted OSRM).
 * Public demo is unreliable from serverless; default is haversine-only.
 */
async function tryOsrmRoute(pickupLat, pickupLon, baseUrl) {
  const trimmed = baseUrl.replace(/\/$/, '');
  const url = `${trimmed}/route/v1/driving/${pickupLon},${pickupLat};${RESTAURANT_COORDS.lon},${RESTAURANT_COORDS.lat}?overview=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RestaurantBookingTool/1.0',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    const durationSeconds = data.routes[0].duration;
    return {
      duration_seconds: durationSeconds,
      duration_minutes: Math.round(durationSeconds / 60),
      within_service_area: durationSeconds <= SERVICE_AREA_THRESHOLD_SECONDS,
      distance_meters: data.routes[0].distance,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Driving time from pickup coordinates to the restaurant.
 * Uses haversine estimate by default; uses OSRM only if OSRM_URL env is set.
 */
async function calculateTravelTime(pickupLat, pickupLon) {
  const customOsrm = (process.env.OSRM_URL || '').trim();
  if (customOsrm) {
    const routed = await tryOsrmRoute(pickupLat, pickupLon, customOsrm);
    if (routed) return routed;
  }
  return estimateTravelFromHaversine(pickupLat, pickupLon);
}

const SATELLITE_PARKING = {
  name: 'Satellite Parking Lot',
  address: '1798 New Vineyard Road',
  city: 'New Vineyard',
  state: 'Maine',
};

module.exports = { calculateTravelTime, SATELLITE_PARKING, RESTAURANT_COORDS };
