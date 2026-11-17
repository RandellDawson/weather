const { validateCoords } = require('./weather');
const cache = new Map();
const TTL = 10 * 60 * 1000;
const FORECAST_TTL = 60 * 60 * 1000;
const forecastCache = new Map();
async function cachedForecast(key, url) {
  const item = forecastCache.get(key);
  if (item && item.expires > Date.now()) return item.data;
  const data = await json(url);
  if (forecastCache.size >= 200) forecastCache.delete(forecastCache.keys().next().value);
  forecastCache.set(key, { data, expires: Date.now() + FORECAST_TTL });
  return data;
}
async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Provider HTTP ' + response.status);
  return response.json();
}
async function getDashboard(req, res) {
  const { lat, lon } = req.query;
  if (!validateCoords(lat, lon)) return res.status(400).json({ error: 'Valid coordinates required' });
  const latitude = Number(lat), longitude = Number(lon);
  if (latitude < 24 || latitude > 50 || longitude < -125 || longitude > -66) {
    return res.status(400).json({ error: 'First-pass NWS integration supports the contiguous US only' });
  }
  const key = latitude.toFixed(3) + ',' + longitude.toFixed(3);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return res.json(cached.data);
  try {
    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({
      latitude, longitude, timezone: 'auto', forecast_days: 16,
      temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset'
    }).forEach(([k,v]) => forecastUrl.searchParams.set(k, String(v)));
    const currentUrl = new URL(forecastUrl);
    currentUrl.searchParams.delete('hourly');
    currentUrl.searchParams.delete('daily');
    currentUrl.searchParams.delete('forecast_days');
    currentUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m');
    const [forecastResult, currentResult, nwsResult, weatherApiResult] = await Promise.allSettled([
      cachedForecast(key, forecastUrl),
      json(currentUrl),
      (async () => {
        const headers = { 'User-Agent': 'RandellDawson-weather (weather.randelldawson.com)', Accept: 'application/geo+json' };
        const point = await json('https://api.weather.gov/points/' + latitude.toFixed(4) + ',' + longitude.toFixed(4), headers);
        const stations = await json(point.properties.observationStations, headers);
        const station = stations.features?.[0];
        if (!station) return null;
        const observation = await json(station.id + '/observations/latest', headers);
        return { station: { id: station.id, name: station.properties.name, coordinates: station.geometry.coordinates }, observation: observation.properties };
      })(),
      (async () => {
        if (!process.env.WEATHERAPI_KEY) return null;
        const url = new URL('https://api.weatherapi.com/v1/current.json');
        url.searchParams.set('key', process.env.WEATHERAPI_KEY);
        url.searchParams.set('q', latitude + ',' + longitude);
        return json(url);
      })()
    ]);
    if (forecastResult.status !== 'fulfilled') throw forecastResult.reason;
    if (currentResult.status !== 'fulfilled') throw currentResult.reason;
    const data = {
      coordinates: { latitude, longitude },
      forecast: { ...forecastResult.value, current: currentResult.value.current },
      nws: nwsResult.status === 'fulfilled' ? nwsResult.value : null,
      weatherapi: weatherApiResult.status === 'fulfilled' ? weatherApiResult.value?.current || null : null,
      sources: { forecast: 'Open-Meteo', station: 'NWS', current: process.env.WEATHERAPI_KEY ? 'WeatherAPI.com' : 'Open-Meteo' },
      fetchedAt: new Date().toISOString()
    };
    // Bound cache memory in the single-process deployment.
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { expires: Date.now() + TTL, data });
    res.set('Cache-Control', 'private, max-age=120');
    return res.json(data);
  } catch (error) {
    console.error('Dashboard weather error:', error.message);
    return res.status(502).json({ error: 'Weather services temporarily unavailable' });
  }
}
module.exports = { getDashboard };
