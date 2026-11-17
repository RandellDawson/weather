const { validateCoords } = require('./weather');
const cache = new Map();
const TTL = 10 * 60 * 1000;
const HOURLY_TTL = 30 * 60 * 1000;
const DAILY_TTL = 60 * 60 * 1000;
const hourlyCache = new Map();
const dailyCache = new Map();
async function cachedForecast(store, key, url, ttl, forceRefresh = false, headers = {}) {
  const item = store.get(key);
  if (!forceRefresh && item && item.expires > Date.now()) return item.data;
  const data = await json(url, headers);
  if (store.size >= 200 && !store.has(key)) store.delete(store.keys().next().value);
  store.set(key, { data, expires: Date.now() + ttl });
  return data;
}
async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Provider HTTP ' + response.status);
  return response.json();
}

const nwsHeaders = { 'User-Agent': 'RandellDawson-weather (weather.randelldawson.com)', Accept: 'application/geo+json' };
const observationAge = observation => observation?.timestamp ? Date.now() - Date.parse(observation.timestamp) : Infinity;
const usableObservation = observation => Number.isFinite(observation?.temperature?.value) && observationAge(observation) >= -300000 && observationAge(observation) <= 5400000;
async function getNws(latitude, longitude, key, forceRefresh) {
  const point = await json('https://api.weather.gov/points/' + latitude.toFixed(4) + ',' + longitude.toFixed(4), nwsHeaders);
  const stations = await json(point.properties.observationStations, nwsHeaders);
  const candidates = (stations.features || []).slice(0, 5);
  const results = await Promise.allSettled(candidates.map(async station => ({
    station: { id: station.id, name: station.properties?.name || station.id, coordinates: station.geometry?.coordinates },
    observation: (await json(station.id + '/observations/latest', nwsHeaders)).properties
  })));
  const valid = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  // Station list is already distance-ordered. Prefer a fresh, complete observation.
  const selected = valid.find(r => usableObservation(r.observation)) || valid[0] || null;
  const hourlyUrl = point.properties.forecastHourly;
  let hourly = null;
  if (hourlyUrl) {
    try { hourly = (await cachedForecast(hourlyCache, 'nws:' + key, hourlyUrl, HOURLY_TTL, forceRefresh, nwsHeaders)).properties?.periods || null; }
    catch (error) { console.warn('NWS hourly forecast unavailable:', error.message); }
  }
  return { selected, hourly };
}
async function getWeatherApi(latitude, longitude, key, forceRefresh) {
  if (!process.env.WEATHERAPI_KEY) return null;
  const url = new URL('https://api.weatherapi.com/v1/forecast.json');
  url.searchParams.set('key', process.env.WEATHERAPI_KEY);
  url.searchParams.set('q', latitude + ',' + longitude);
  url.searchParams.set('days', '3');
  url.searchParams.set('aqi', 'no');
  url.searchParams.set('alerts', 'no');
  // Fetch current independently: forecast entitlement/errors must not suppress current metrics.
  const currentUrl = new URL('https://api.weatherapi.com/v1/current.json');
  currentUrl.searchParams.set('key', process.env.WEATHERAPI_KEY);
  currentUrl.searchParams.set('q', latitude + ',' + longitude);
  const [forecast, current] = await Promise.allSettled([
    cachedForecast(hourlyCache, 'weatherapi:' + key, url, HOURLY_TTL, forceRefresh),
    json(currentUrl)
  ]);
  if (forecast.status === 'rejected') console.warn('WeatherAPI forecast unavailable:', forecast.reason.message);
  if (current.status === 'rejected') console.warn('WeatherAPI current unavailable:', current.reason.message);
  return {
    ...(forecast.status === 'fulfilled' ? forecast.value : {}),
    current: current.status === 'fulfilled' ? current.value.current : null
  };
}
function validNwsHourly(periods) {
  if (!Array.isArray(periods)) return false;
  const future = periods.filter(p => Date.parse(p.endTime) > Date.now());
  return future.length >= 24 && future.slice(0,24).every(p => Number.isFinite(p.temperature) && p.shortForecast);
}
function validWeatherApiHourly(data) {
  return Array.isArray(data?.forecast?.forecastday) && data.forecast.forecastday.flatMap(d => d.hour || []).filter(h => Date.parse(h.time_epoch * 1000) >= Date.now()).length >= 24;
}

async function getDashboard(req, res) {
  const { lat, lon } = req.query;
  if (!validateCoords(lat, lon)) return res.status(400).json({ error: 'Valid coordinates required' });
  const latitude = Number(lat), longitude = Number(lon);
  if (latitude < 24 || latitude > 50 || longitude < -125 || longitude > -66) {
    return res.status(400).json({ error: 'First-pass NWS integration supports the contiguous US only' });
  }
  // Explicit reload bypasses provider caches; existing endpoint rate limits still apply.
  const forceRefresh = req.query.refresh === '1';
  const key = latitude.toFixed(3) + ',' + longitude.toFixed(3);
  const cached = cache.get(key);
  if (!forceRefresh && cached && cached.expires > Date.now()) return res.json(cached.data);
  try {
    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({
      latitude, longitude, timezone: 'auto', forecast_days: 16,
      temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset'
    }).forEach(([k,v]) => forecastUrl.searchParams.set(k, String(v)));
    const hourlyUrl = new URL(forecastUrl);
    hourlyUrl.searchParams.delete('daily');
    hourlyUrl.searchParams.set('forecast_days', '2');
    const dailyUrl = new URL(forecastUrl);
    dailyUrl.searchParams.delete('hourly');
    const currentUrl = new URL(forecastUrl);
    currentUrl.searchParams.delete('hourly');
    currentUrl.searchParams.delete('daily');
    currentUrl.searchParams.delete('forecast_days');
    currentUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,surface_pressure,wind_direction_10m,is_day');
    const [hourlyResult, dailyResult, currentResult, nwsResult, weatherApiResult] = await Promise.allSettled([
      cachedForecast(hourlyCache, key, hourlyUrl, HOURLY_TTL, forceRefresh),
      cachedForecast(dailyCache, key, dailyUrl, DAILY_TTL, forceRefresh),
      json(currentUrl),
      getNws(latitude, longitude, key, forceRefresh),
      getWeatherApi(latitude, longitude, key, forceRefresh)
    ]);
    if (hourlyResult.status !== 'fulfilled') throw hourlyResult.reason;
    if (dailyResult.status !== 'fulfilled') throw dailyResult.reason;
    if (currentResult.status !== 'fulfilled') throw currentResult.reason;
    const nws = nwsResult.status === 'fulfilled' ? nwsResult.value : null;
    const weatherapi = weatherApiResult.status === 'fulfilled' ? weatherApiResult.value : null;
    const currentSource = usableObservation(nws?.selected?.observation) ? 'NWS' : Number.isFinite(weatherapi?.current?.temp_f) ? 'WeatherAPI.com' : 'Open-Meteo';
    const hourlySource = validNwsHourly(nws?.hourly) ? 'NWS' : validWeatherApiHourly(weatherapi) ? 'WeatherAPI.com' : 'Open-Meteo';
    const data = {
      coordinates: { latitude, longitude },
      forecast: { ...dailyResult.value, hourly: hourlyResult.value.hourly, current: currentResult.value.current },
      nws: nws?.selected || null,
      nwsHourly: hourlySource === 'NWS' ? nws.hourly : null,
      weatherapi: weatherapi?.current || null,
      weatherapiHourly: hourlySource === 'WeatherAPI.com' ? weatherapi.forecast.forecastday.flatMap(d => d.hour || []) : null,
      weatherapiDaily: Array.isArray(weatherapi?.forecast?.forecastday) ? weatherapi.forecast.forecastday : [],
      sources: { forecast: 'Open-Meteo', hourly: hourlySource, station: 'NWS', current: currentSource },
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
