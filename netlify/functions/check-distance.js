const { geocodeAddress } = require('../../utils/geocode');
const { calculateTravelTime, SATELLITE_PARKING } = require('../../utils/osrm');
const { corsHeaders } = require('../../utils/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  try {
    const { address } = JSON.parse(event.body || '{}');

    if (!address || typeof address !== 'string' || address.trim().length < 5) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Please provide a valid street address.' }),
      };
    }

    const geo = await geocodeAddress(address);
    const travel = await calculateTravelTime(geo.lat, geo.lon);

    const response = {
      address: geo.display_name,
      travel_time_minutes: travel.duration_minutes,
      within_service_area: travel.within_service_area,
    };

    // If outside service area, provide satellite parking info
    if (!travel.within_service_area) {
      response.satellite_parking = SATELLITE_PARKING;
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(response),
    };
  } catch (err) {
    console.error('check-distance error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Failed to check distance.' }),
    };
  }
};
