const { validateCoords } = require('./weather');
const cache = new Map();
const lastGood = new Map();
const TTL = 10 * 60 * 1000;
const HOURLY_TTL = 30 * 60 * 1000;
const DAILY_TTL = 60 * 60 * 1000;
const hourlyCache = new Map();
const dailyCache = new Map();
async function cachedForecast(store, key, url, ttl, forceRefresh = false, headers = {}) {
  const item = store.get(key);
  if (!forceRefresh && item && item.expires > Date.now()) return item.data;
  let data;
  try { data = await json(url, headers); }
  catch (error) {
    if (!item?.data) throw error;
    console.warn('Using previous forecast:', error.message);
    return item.data;
  }
  if (store.size >= 200 && !store.has(key)) store.delete(store.keys().next().value);
  store.set(key, { data, expires: Date.now() + ttl });
  return data;
}
async function json(url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (response.ok) return await response.json();
      lastError = new Error(new URL(url).hostname + ' HTTP ' + response.status);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) { lastError = error; }
  }
  throw lastError;
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
    current: current.status === 'fulfilled' ? current.value.current : null,
    location: forecast.status === 'fulfilled' || current.status === 'fulfilled' ? {
      ...(forecast.status === 'fulfilled' ? forecast.value.location : {}),
      ...(current.status === 'fulfilled' ? current.value.location : {})
    } : null
  };
}

// Use Census incorporated-place boundaries rather than WeatherAPI's nearest named point.
// Cache results to avoid repeated reverse-geocoding requests on refresh.
const placeCache = new Map();
const PLACE_TTL = 24 * 60 * 60 * 1000;
async function getCensusPlace(latitude, longitude, key) {
  const cached = placeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.location;
  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
  url.searchParams.set('x', String(longitude));
  url.searchParams.set('y', String(latitude));
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('format', 'json');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Census HTTP ' + response.status);
    const data = await response.json();
    const geographies = data?.result?.geographies || {};
    const places = geographies['Incorporated Places'] || [];
    const place = places.find(p => p.NAME && p.STATE);
    const location = place ? {
      city: place.NAME.replace(/ (city|town|village|borough)$/i, ''),
      region: null
    } : null;
    if (placeCache.size >= 200) placeCache.delete(placeCache.keys().next().value);
    placeCache.set(key, { location, expires: Date.now() + PLACE_TTL });
    return location;
  } catch (error) {
    console.warn('Census city lookup unavailable:', error.message);
    return null;
  }
}
function validNwsHourly(periods) {
  if (!Array.isArray(periods)) return false;
  const future = periods.filter(p => Date.parse(p.endTime) > Date.now());
  return future.length >= 24 && future.slice(0,24).every(p => Number.isFinite(p.temperature) && p.shortForecast);
}
function validWeatherApiHourly(data) {
  return Array.isArray(data?.forecast?.forecastday) && data.forecast.forecastday.flatMap(d => d.hour || []).filter(h => Number(h.time_epoch) * 1000 >= Date.now()).length >= 24;
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
    for (const [name, result] of [['hourly', hourlyResult], ['daily', dailyResult], ['current', currentResult]]) {
      if (result.status === 'rejected') console.warn('Open-Meteo ' + name + ' unavailable:', result.reason.message);
    }
    const nws = nwsResult.status === 'fulfilled' ? nwsResult.value : null;
    const weatherapi = weatherApiResult.status === 'fulfilled' ? weatherApiResult.value : null;
    const apiDays = weatherapi?.forecast?.forecastday || [];
    const daily = dailyResult.status === 'fulfilled' ? dailyResult.value.daily : apiDays.length ? {
      time: apiDays.map(d => d.date),
      weather_code: apiDays.map(() => 0),
      temperature_2m_min: apiDays.map(d => d.day?.mintemp_f),
      temperature_2m_max: apiDays.map(d => d.day?.maxtemp_f),
      precipitation_probability_max: apiDays.map(d => Number(d.day?.daily_chance_of_rain ?? 0)),
      wind_speed_10m_max: apiDays.map(d => d.day?.maxwind_mph),
      wind_gusts_10m_max: apiDays.map(() => null)
    } : null;
    const current = currentResult.status === 'fulfilled' ? currentResult.value.current : {
      time: new Date().toISOString(), is_day: weatherapi?.current?.is_day ?? 1, weather_code: 0,
      temperature_2m: weatherapi?.current?.temp_f ?? (usableObservation(nws?.selected?.observation) ? nws.selected.observation.temperature.value * 9 / 5 + 32 : null),
      apparent_temperature: weatherapi?.current?.feelslike_f ?? null,
      relative_humidity_2m: weatherapi?.current?.humidity ?? null,
      wind_speed_10m: weatherapi?.current?.wind_mph ?? null,
      wind_gusts_10m: weatherapi?.current?.gust_mph ?? null,
      cloud_cover: weatherapi?.current?.cloud ?? null
    };
    const hourly = hourlyResult.status === 'fulfilled' ? hourlyResult.value.hourly : {time: [], temperature_2m: [], weather_code: [], precipitation_probability: []};
    if (!daily?.time?.length || (currentResult.status !== 'fulfilled' && !usableObservation(nws?.selected?.observation) && !Number.isFinite(weatherapi?.current?.temp_f)) ||
      (hourlyResult.status !== 'fulfilled' && !validNwsHourly(nws?.hourly) && !validWeatherApiHourly(weatherapi))) {
      throw new Error('No usable provider data for every dashboard section');
    }
    const currentSource = usableObservation(nws?.selected?.observation) ? 'NWS' : Number.isFinite(weatherapi?.current?.temp_f) ? 'WeatherAPI.com' : 'Open-Meteo';
    const hourlySource = validNwsHourly(nws?.hourly) ? 'NWS' : validWeatherApiHourly(weatherapi) ? 'WeatherAPI.com' : 'Open-Meteo';
    const censusPlace = await getCensusPlace(latitude, longitude, key);
    const data = {
      coordinates: { latitude, longitude },
      forecast: { ...(dailyResult.status === 'fulfilled' ? dailyResult.value : hourlyResult.status === 'fulfilled' ? hourlyResult.value : {}), timezone: dailyResult.status === 'fulfilled' ? dailyResult.value.timezone : hourlyResult.status === 'fulfilled' ? hourlyResult.value.timezone : weatherapi?.location?.tz_id || 'UTC', daily, hourly, current },
      nws: nws?.selected || null,
      nwsHourly: hourlySource === 'NWS' ? nws.hourly : null,
      weatherapi: weatherapi?.current || null,
      location: censusPlace ? { city: censusPlace.city, region: weatherapi?.location?.region || null } : weatherapi?.location ? { city: weatherapi.location.name, region: weatherapi.location.region } : null,
      weatherapiHourly: hourlySource === 'WeatherAPI.com' ? weatherapi.forecast.forecastday.flatMap(d => d.hour || []) : null,
      weatherapiDaily: Array.isArray(weatherapi?.forecast?.forecastday) ? weatherapi.forecast.forecastday : [],
      sources: { forecast: dailyResult.status === 'fulfilled' ? 'Open-Meteo' : 'WeatherAPI.com', hourly: hourlySource, station: 'NWS', current: currentSource },
      fetchedAt: new Date().toISOString()
    };
    // Bound cache memory in the single-process deployment.
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { expires: Date.now() + TTL, data });
    if (lastGood.size >= 200) lastGood.delete(lastGood.keys().next().value);
    lastGood.set(key, data);
    res.set('Cache-Control', 'private, max-age=120');
    return res.json(data);
  } catch (error) {
    console.error('Dashboard weather error:', error.message);
    const previous = lastGood.get(key);
    if (previous) { res.set('Cache-Control', 'no-store'); return res.json({...previous, stale: true}); }
    return res.status(502).json({ error: 'Weather services temporarily unavailable' });
  }
}
module.exports = { getDashboard };
