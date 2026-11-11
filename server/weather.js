const imgLinks = require('./weather-icons.json');

function validateCoords(lat, lon) {
  if (typeof lat !== 'string' || typeof lon !== 'string' ||
      !lat.trim() || !lon.trim()) return false;
  const latitude = Number(lat), longitude = Number(lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function normalizeWeather(data) {
  if (!Array.isArray(data.weather)) return data;
  return {
    ...data,
    weather: data.weather.map(item => ({
      ...item,
      icon: imgLinks[item.icon] || item.icon
    }))
  };
}

async function getWeather(req, res) {
  const { lat, lon } = req.query;
  if (!validateCoords(lat, lon)) {
    return res.status(400).json({ error: 'lat and lon must be valid coordinates' });
  }

  const { API_URL, API_KEY } = process.env;
  if (!API_URL || !API_KEY) {
    return res.status(503).json({ error: 'Weather service is not configured' });
  }

  try {
    const url = new URL(API_URL + API_KEY);
    url.searchParams.set('lat', String(Number(lat)));
    url.searchParams.set('lon', String(Number(lon)));
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Weather provider HTTP ' + response.status);
    const data = await response.json();
    if (Number(data.cod) !== 200) throw new Error('Weather provider returned an error');
    res.set('Cache-Control', 'private, max-age=120');
    return res.json(normalizeWeather(data));
  } catch (error) {
    console.error('Weather request failed:', error.message);
    return res.status(502).json({ error: 'Unable to retrieve weather data' });
  }
}

module.exports = { getWeather, validateCoords, normalizeWeather };
