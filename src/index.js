'use strict';
const $ = id => document.getElementById(id);
const codeText = c => ({0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',61:'Rain',63:'Rain',65:'Heavy rain',71:'Snow',73:'Snow',75:'Heavy snow',80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorms'})[c] || 'Variable conditions';
// Local, dependency-free weather icons. Supports Open-Meteo WMO codes and day/night.
function weatherIcon(code, isDay = true) {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code === 1) return isDay ? '🌤️' : '🌙';
  if (code === 2) return isDay ? '⛅' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51,53,55,56,57].includes(code)) return '🌦️';
  if ([61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if ([71,73,75,77,85,86].includes(code)) return '🌨️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '🌥️';
}
function iconNode(code, isDay = true) {
  const node = document.createElement('span');
  node.className = 'weather-icon';
  node.setAttribute('role','img');
  node.setAttribute('aria-label', codeText(code));
  node.textContent = weatherIcon(code, isDay);
  return node;
}
function nwsConditionIcon(description, isDay) {
  const t = (description || '').toLowerCase();
  if (/thunder|lightning/.test(t)) return '⛈️';
  if (/snow|sleet|ice pellets|blizzard/.test(t)) return '🌨️';
  if (/rain|showers|drizzle/.test(t)) return '🌧️';
  if (/fog|mist|haze|smoke/.test(t)) return '🌫️';
  if (/overcast|cloudy/.test(t)) return '☁️';
  if (/partly|mostly sunny|mostly clear/.test(t)) return isDay ? '⛅' : '☁️';
  if (/clear|sunny|fair/.test(t)) return isDay ? '☀️' : '🌙';
  return '🌥️';
}
function nwsValue(value, convert = x => x, unit = '') {
  return typeof value === 'number' && Number.isFinite(value) ? val(Math.round(convert(value) * 10) / 10, unit) : null;
}
const val = (x, unit = '') => x == null ? '—' : x + unit;
function metric(label, value) { const box=document.createElement('div');box.className='metric';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(small,strong);return box; }
function card(parent, className, values) { const box=document.createElement('div');box.className=className;for(const [tag,text] of values){const node=document.createElement(tag);node.textContent=text;box.append(node);}parent.append(box); }
// Use the forecast location's sunrise/sunset rather than the browser's timezone.
let solarSchedule = null;
function updateTheme() {
  if (!solarSchedule) return;
  const now = Date.now();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: solarSchedule.timezone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  const today = parts.year + '-' + parts.month + '-' + parts.day;
  const index = solarSchedule.dates.indexOf(today);
  if (index < 0) return;
  const sunrise = Date.parse(solarSchedule.sunrise[index]);
  const sunset = Date.parse(solarSchedule.sunset[index]);
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset)) return;
  const isDay = now >= sunrise && now < sunset;
  document.documentElement.dataset.theme = isDay ? 'day' : 'night';
  document.documentElement.style.colorScheme = isDay ? 'light' : 'dark';
  try { localStorage.setItem('weather-theme',JSON.stringify({theme:isDay?'day':'night',savedAt:now})); } catch { /* Storage can be unavailable in private browsing. */ }
}
function setSolarSchedule(forecast) {
  if (!forecast?.timezone || !forecast.daily?.time || !forecast.daily?.sunrise || !forecast.daily?.sunset) return;
  solarSchedule = {
    timezone: forecast.timezone,
    dates: forecast.daily.time,
    sunrise: forecast.daily.sunrise,
    sunset: forecast.daily.sunset
  };
  updateTheme();
}

function render(data, selectedPlace = null) {
  setSolarSchedule(data.forecast);
  const city=(selectedPlace?.name || data.location?.city)?.trim();
  const region=(selectedPlace?.region || data.location?.region)?.trim();
  $('current-city').textContent=city ? city + (region ? ', ' + region : '') : 'Current Location';
  const f=data.forecast, c=f.current, w=data.weatherapi;
  const station=data.nws;
  const obs=station?.observation;
  const observedAt=obs?.timestamp ? Date.parse(obs.timestamp) : NaN;
  // Reject missing, future, or stale observations; keep the forecast usable.
  const useNws = data.sources.current === 'NWS';
  const useWeatherApi = data.sources.current === 'WeatherAPI.com';
  const isDay=c.is_day !== 0;
  const description=obs?.textDescription?.trim();
  $('temperature').textContent=useNws ? nwsValue(obs.temperature.value, x => x * 9 / 5 + 32, '°F') : val(useWeatherApi ? w.temp_f : c.temperature_2m,'°F');
  const icon=iconNode(c.weather_code,isDay);
  if (useNws && description) {icon.textContent=nwsConditionIcon(description,isDay);icon.setAttribute('aria-label',description);}
  if (useWeatherApi && w?.condition?.text) {icon.textContent=nwsConditionIcon(w.condition.text,isDay);icon.setAttribute('aria-label',w.condition.text);}
  $('current-icon').replaceChildren(icon);
  $('conditions').textContent=useNws ? (description || 'Observed conditions') : useWeatherApi ? (w.condition?.text || codeText(c.weather_code)) : codeText(c.weather_code);
  const source=$('source');
  if (useNws) {
    const label=document.createElement('span');
    label.textContent='NWS observed at ' + station.station.name;
    const timestamp=document.createElement('time');
    timestamp.className='source-timestamp';
    timestamp.dateTime=obs.timestamp;
    timestamp.textContent=new Date(observedAt).toLocaleString();
    source.replaceChildren(label,timestamp);
  } else {
    source.textContent=useWeatherApi ? 'WeatherAPI.com current conditions · ' + (w.last_updated || 'latest') : 'Open-Meteo modeled current conditions · ' + c.time;
  }
  const hourlySourceLabel=document.createElement('span');
  hourlySourceLabel.className='source-detail';
  hourlySourceLabel.textContent='Hourly Forecast: ' + data.sources.hourly;
  const dailySourceLabel=document.createElement('span');
  dailySourceLabel.className='source-detail';
  const weatherApiUsed = Array.isArray(data.weatherapiDaily) && data.weatherapiDaily.some(day => f.daily.time.slice(0,3).includes(day.date) && Number.isFinite(day.day?.mintemp_f) && Number.isFinite(day.day?.maxtemp_f) && day.day?.condition?.text);
  dailySourceLabel.textContent='Daily Forecast: ';
  if (weatherApiUsed) {
    dailySourceLabel.append('First 3 Days Powered by ');
    const attribution=document.createElement('a');
    attribution.href='https://www.weatherapi.com/';
    attribution.title='Weather API';
    attribution.textContent='WeatherAPI.com';
    dailySourceLabel.append(attribution, ', Remaining Days: Open-Meteo');
  } else {
    dailySourceLabel.append(data.sources.forecast);
  }
  source.append(hourlySourceLabel,dailySourceLabel);
  $('feels-like').textContent='Feels Like '+val(w?.feelslike_f ?? c.apparent_temperature,'°F');
  const m=$('metrics');m.replaceChildren();
  const obsMetric=(field, convert, unit, fallback) => useNws ? (nwsValue(obs[field]?.value,convert,unit) ?? fallback) : fallback;
  [
    ['Humidity',obsMetric('relativeHumidity',x=>x,'%',val(w?.humidity ?? c.relative_humidity_2m,'%'))],
    ['Wind',obsMetric('windSpeed',x=>x*2.236936,' mph',val(w?.wind_mph ?? c.wind_speed_10m,' mph'))],
    ['Gust',obsMetric('windGust',x=>x*2.236936,' mph',val(w?.gust_mph ?? c.wind_gusts_10m,' mph'))],
    ['Dew Point',obsMetric('dewpoint',x=>x*9/5+32,'°F',val(w?.dewpoint_f,'°F'))],
    ['Pressure',obsMetric('barometricPressure',x=>x/3386.389,' inHg',val(w?.pressure_in ?? (Number.isFinite(c.surface_pressure) ? Math.round(c.surface_pressure * 0.0295299830714 * 100) / 100 : null),' inHg'))],
    // NWS observations expose cloud layers, not a reliable total percentage.
    // Prefer WeatherAPI's measured cloud percentage over Open-Meteo's modeled value.
    ['Cloud Cover',val(Number.isFinite(w?.cloud) ? w.cloud : c.cloud_cover,'%')]
  ].forEach(([a,b])=>m.append(metric(a,b)));
  const h=$('hourly');h.replaceChildren();
  const hourlySource=data.sources.hourly;
  function compass(degrees) {
    return Number.isFinite(degrees) ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(((degrees % 360) + 360) % 360 / 45) % 8] : null;
  }
  function addHour(time, temp, description, chance, symbol, isDay, windSpeed, windDirection, windGust) {
    card(h,'hour',[['small',time],['strong',val(Math.round(temp),'°')],['small',description],['small',val(chance,'% Rain')]]);
    const hour=h.lastElementChild;
    hour.children[2].classList.add('hour-description');
    hour.children[3].classList.add('hour-precipitation');
    const icon=iconNode(0,isDay);
    icon.textContent=symbol;
    icon.setAttribute('aria-label',description);
    hour.insertBefore(icon,hour.children[1]);
    const wind=document.createElement('div');
    wind.className='hour-wind';
    const speedText=windSpeed == null || windSpeed === '' ? '—' : (typeof windSpeed === 'number' ? Math.round(windSpeed)+' mph' : windSpeed);
    const directionText=windDirection ? windDirection+' ' : '';
    const speed=document.createElement('span');
    speed.textContent='Wind: '+directionText+speedText;
    wind.append(speed);
    if (Number.isFinite(windGust)) {
      const gust=document.createElement('span');
      gust.textContent='Gusts: '+Math.round(windGust)+' mph';
      wind.append(gust);
    }
    hour.append(wind);
  }
  if (hourlySource==='NWS') {
    data.nwsHourly.filter(p=>Date.parse(p.endTime)>Date.now()).slice(0,24).forEach(p=>{
      const time=new Date(p.startTime).toLocaleTimeString('en-US',{hour:'numeric'});
      const description=p.shortForecast || 'Variable conditions';
      addHour(time,p.temperatureUnit==='C'?p.temperature*9/5+32:p.temperature,description,p.probabilityOfPrecipitation?.value ?? null,nwsConditionIcon(description,p.isDaytime),p.isDaytime,p.windSpeed,p.windDirection,null);
    });
  } else if (hourlySource==='WeatherAPI.com') {
    data.weatherapiHourly.filter(p=>p.time_epoch*1000>=Date.now()-3600000).slice(0,24).forEach(p=>{
      const description=p.condition?.text || 'Variable conditions';
      addHour(new Date(p.time_epoch*1000).toLocaleTimeString('en-US',{hour:'numeric'}),p.temp_f,description,p.chance_of_rain ?? null,nwsConditionIcon(description,p.is_day===1),p.is_day===1,p.wind_mph,p.wind_dir,p.gust_mph);
    });
  } else {
    const times=f.hourly.time;let start=times.findIndex(t=>t>=c.time.slice(0,13)+':00');if(start<0)start=0;
    for(let i=start;i<Math.min(start+24,times.length);i++){
      const date=new Date(times[i]+'Z');
      const description=codeText(f.hourly.weather_code[i]);
      addHour(new Intl.DateTimeFormat('en-US',{hour:'numeric',timeZone:'UTC'}).format(date),f.hourly.temperature_2m[i],description,f.hourly.precipitation_probability[i],weatherIcon(f.hourly.weather_code[i],f.hourly.is_day?.[i]!==0),f.hourly.is_day?.[i]!==0,f.hourly.wind_speed_10m?.[i],compass(f.hourly.wind_direction_10m?.[i]),f.hourly.wind_gusts_10m?.[i]);
    }
  }
  const d=$('daily');d.replaceChildren();
  const dailyWindDirection = degrees => Number.isFinite(degrees)
    ? ['N','NE','E','SE','S','SW','W','NW'][Math.round((((degrees % 360)+360)%360)/45)%8]
    : '—';
  const weatherApiDays = new Map((data.weatherapiDaily || []).slice(0,3)
    .filter(item => item?.date && Number.isFinite(item.day?.mintemp_f) && Number.isFinite(item.day?.maxtemp_f) && item.day?.condition?.text)
    .map(item => [item.date,item]));
  f.daily.time.forEach((date,i) => {
    const weatherDay = i < 3 ? weatherApiDays.get(date) : null;
    const weatherDetails = weatherDay?.day;
    const weatherHours = Array.isArray(weatherDay?.hour) ? weatherDay.hour : [];
    const weatherGusts = weatherHours.map(hour => hour.gust_mph).filter(Number.isFinite);
    const row=document.createElement('div');
    row.className='day';
    const top=document.createElement('div');
    top.className='day-top';
    const dateLabel=document.createElement('time');
    dateLabel.dateTime=date;
    dateLabel.className='day-date';
    dateLabel.textContent=new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
    const condition=document.createElement('div');
    condition.className='day-condition';
    const description=document.createElement('span');
    description.textContent=weatherDetails ? weatherDetails.condition.text : codeText(f.daily.weather_code[i]);
    if (weatherDetails) {
      const icon=document.createElement('span');
      icon.className='weather-icon';
      icon.setAttribute('role','img');
      icon.setAttribute('aria-label',description.textContent);
      icon.textContent=nwsConditionIcon(description.textContent,true);
      condition.append(icon,description);
    } else {
      condition.append(iconNode(f.daily.weather_code[i]),description);
    }
    const temperatures=document.createElement('strong');
    temperatures.className='day-temperatures';
    temperatures.textContent=Math.round(weatherDetails ? weatherDetails.mintemp_f : f.daily.temperature_2m_min[i])+'° / '+Math.round(weatherDetails ? weatherDetails.maxtemp_f : f.daily.temperature_2m_max[i])+'°';
    top.append(dateLabel,condition,temperatures);
    const bottom=document.createElement('div');
    bottom.className='day-details';
    const precipitation=document.createElement('span');
    precipitation.className='day-precipitation';
    precipitation.textContent='💧 '+val(weatherDetails && Number.isFinite(Number(weatherDetails.daily_chance_of_rain)) ? Number(weatherDetails.daily_chance_of_rain) : f.daily.precipitation_probability_max[i],'% Rain');
    const wind=document.createElement('span');
    wind.className='day-wind';
    const maxWind=weatherDetails ? weatherDetails.maxwind_mph : f.daily.wind_speed_10m_max?.[i];
    const direction=weatherDetails ? '' : dailyWindDirection(f.daily.wind_direction_10m_dominant?.[i])+' ';
    wind.textContent='Max Wind: '+direction+(Number.isFinite(maxWind)?Math.round(maxWind)+' mph':'—');
    const gust=document.createElement('span');
    gust.className='day-gust';
    const maxGust=weatherDetails ? (weatherGusts.length ? Math.max(...weatherGusts) : null) : f.daily.wind_gusts_10m_max?.[i];
    gust.textContent='Max Gusts: '+(Number.isFinite(maxGust)?Math.round(maxGust)+' mph':'—');
    bottom.append(precipitation,wind,gust);
    row.append(top,bottom);
    d.append(row);
  });
}

const RECENT_KEY = 'weather-recent-locations-v1';
let suggestions = [], selectedSuggestion = null, activeSuggestion = -1, searchTimer = null, searchSequence = 0;
function locationLabel(place) { return place.name + (place.region ? ', ' + place.region : ''); }
function suggestionLabel(place) { return place.zip ? place.zip + ' — ' + locationLabel(place) : locationLabel(place); }
function recentLabel(place) { return locationLabel(place) + (place.zip ? ' (' + place.zip + ')' : ''); }
const US_STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',
  IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',
  NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
  NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
  RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',
  VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};
function normalizedPlaceKey(place) {
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const state = String(place.region || '').trim();
  const fullState = US_STATES[state.toUpperCase()] || state;
  return normalize(place.name) + ':' + normalize(fullState);
}
function samePlace(a, b) {
  // A ZIP search is distinct from a city search, even if both resolve to the same city.
  // ZIPs must match by their exact five-digit code, not by city name or coordinates.
  if (a.zip || b.zip) return Boolean(a.zip && b.zip && a.zip === b.zip);
  return a.id === b.id || normalizedPlaceKey(a) === normalizedPlaceKey(b);
}
function recentLocations() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    const unique = [];
    for (const place of saved) {
      if (!place || typeof place.id !== 'string' || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
      if (!unique.some(existing => samePlace(existing, place))) unique.push(place);
      if (unique.length === 5) break;
    }
    return unique;
  } catch { return []; }
}
function saveRecents(items) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0,5))); } catch {} renderRecents(); }
function renderRecents() {
  const host = $('recent-locations'); host.replaceChildren();
  const places = recentLocations();
  if (!places.length) return;
  const title = document.createElement('span'); title.className = 'recent-title'; title.textContent = 'Recent Locations'; host.append(title);
  for (const place of places) {
    const chip = document.createElement('div'); chip.className = 'recent-chip';
    const open = document.createElement('button'); open.type = 'button'; open.textContent = recentLabel(place);
    open.addEventListener('click', () => chooseLocation(place));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'recent-remove';
    remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove ' + recentLabel(place));
    remove.addEventListener('click', () => saveRecents(recentLocations().filter(p => p.id !== place.id)));
    chip.append(open, remove); host.append(chip);
  }
}
function rememberLocation(place) {
  // City and ZIP searches can resolve to different coordinates or state formats.
  saveRecents([place, ...recentLocations().filter(p => !samePlace(p, place))]);
}
function clearSuggestions() {
  suggestions = []; activeSuggestion = -1;
  $('location-suggestions').replaceChildren(); $('location-suggestions').hidden = true;
  $('location-suggestions').scrollTop = 0;
  $('location-query').setAttribute('aria-expanded','false');
}
function showSuggestions(items) {
  suggestions = items; activeSuggestion = -1;
  const list = $('location-suggestions'); list.replaceChildren();
  items.forEach((place, index) => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'location-option';
    item.setAttribute('role','option'); item.id = 'location-option-' + index;
    item.textContent = suggestionLabel(place);
    item.addEventListener('click', () => { selectedSuggestion = place; $('location-query').value = locationLabel(place); clearSuggestions(); chooseLocation(place); });
    list.append(item);
  });
  list.hidden = !items.length;
  // Reset only after the list is visible and populated; browsers can restore
  // the previous scroll offset when a previously hidden element is shown.
  list.scrollTop = 0;
  $('location-query').setAttribute('aria-expanded', String(!!items.length));
}
async function findLocations(q) {
  const response = await fetch('/api/locations/search?' + new URLSearchParams({q}), {cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Location lookup failed');
  return data.results || [];
}
async function chooseLocation(place) {
  // Invalidate any pending autocomplete request before it can overwrite selection.
  clearTimeout(searchTimer);
  searchSequence++;
  selectedSuggestion = place;
  $('location-message').textContent = '';
  clearSuggestions();
  const success = await load(place.lat, place.lon, place);
  if (success) { rememberLocation(place); $('location-query').value = locationLabel(place); }
  else $('location-message').textContent = 'Weather could not be loaded for ' + locationLabel(place) + '.';
}
const queryInput = $('location-query');
queryInput.addEventListener('input', () => {
  selectedSuggestion = null;
  clearTimeout(searchTimer); searchSequence++;
  const q = queryInput.value.trim();
  clearSuggestions(); $('location-message').textContent = '';
  if (q.length < 3 || (/^\d+$/.test(q) && q.length !== 5)) return;
  const seq = searchSequence;
  searchTimer = setTimeout(async () => {
    try {
      const results = await findLocations(q);
      if (seq !== searchSequence) return;
      showSuggestions(results);
      if (!results.length) $('location-message').textContent = /^\d{5}$/.test(q) ? 'ZIP code not found.' : 'No matching U.S. cities found.';
    } catch (error) { if (seq === searchSequence) $('location-message').textContent = error.message; }
  }, 300);
});
// Dismiss suggestions when interacting outside the search controls.
// Keep clicks on suggestion buttons working by treating the whole form as inside.
document.addEventListener('pointerdown', event => {
  if (!$('location-form').contains(event.target)) clearSuggestions();
});
queryInput.addEventListener('keydown', event => {
  if (!suggestions.length) return;
  if (event.key === 'Escape') { clearSuggestions(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); activeSuggestion = (activeSuggestion + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length;
    [...$('location-suggestions').children].forEach((node,i) => node.setAttribute('aria-selected',String(i === activeSuggestion)));
    queryInput.setAttribute('aria-activedescendant','location-option-' + activeSuggestion);
  } else if (event.key === 'Enter' && activeSuggestion >= 0) {
    event.preventDefault(); const place = suggestions[activeSuggestion];
    selectedSuggestion = place; queryInput.value = locationLabel(place); chooseLocation(place);
  }
});
$('location-form').addEventListener('submit', async event => {
  event.preventDefault(); clearTimeout(searchTimer); searchSequence++;
  const q = queryInput.value.trim();
  if (!q) { $('location-message').textContent = 'Enter a U.S. city or five-digit ZIP code.'; return; }
  if (selectedSuggestion && q === locationLabel(selectedSuggestion)) { await chooseLocation(selectedSuggestion); return; }
  if (/^\d+$/.test(q) && !/^\d{5}$/.test(q)) { $('location-message').textContent = 'Enter a five-digit U.S. ZIP code.'; return; }
  if (q.length < 3) { $('location-message').textContent = 'Enter at least three letters of a city name.'; return; }
  try {
    const results = await findLocations(q);
    if (!results.length) { $('location-message').textContent = 'No matching U.S. city or ZIP code found.'; return; }
    showSuggestions(results);
    $('location-message').textContent = /^\d{5}$/.test(q) ? 'Select the matching ZIP code location.' : 'Select a city from the suggestions.';
  } catch (error) { $('location-message').textContent = error.message; }
});
renderRecents();

const REFRESH_MS = 15 * 60 * 1000;
let lastCoordinates = null;
let lastSelectedPlace = null;
let lastSuccessfulRefresh = 0;
let loading = false;
// A browser navigation reload triggers one uncached provider fetch.
let reloadPending = performance.getEntriesByType('navigation').some(entry => entry.type === 'reload');
async function load(lat,lon,selectedPlace = null) {
  if (loading) return false;
  loading = true;
  $('status').textContent='Loading weather…';
  const forceRefresh = reloadPending;
  reloadPending = false;
  try{const response=await fetch('/api/dashboard?'+new URLSearchParams({lat,lon,...(forceRefresh?{refresh:'1'}:{})}),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');render(data,selectedPlace);lastCoordinates={lat,lon};lastSelectedPlace=selectedPlace;lastSuccessfulRefresh=Date.now();$('status').textContent='Updated '+new Date(data.fetchedAt).toLocaleTimeString();return true;}
  catch(e){$('status').textContent='Unable to load weather: '+e.message;return false;}
  finally{loading=false;}
}
function locate() {
  const button = $('locate');
  button.disabled = true;
  button.textContent = 'Updating…';
  const finish = () => { button.disabled = false; button.textContent = '↻ Refresh'; };
  if (!navigator.geolocation) {
    $('status').textContent='Your browser does not support geolocation.';
    finish();
    return;
  }
  $('status').textContent='Requesting your location…';
  navigator.geolocation.getCurrentPosition(
    async position => { try { await load(position.coords.latitude, position.coords.longitude); } finally { finish(); } },
    error => {
      const message = error.code === 1 ? 'Location permission denied. Enable location access in your browser settings and retry.'
        : error.code === 2 ? 'Your location could not be determined. Please retry.'
        : 'Location request timed out. Please retry.';
      $('status').textContent=message;
      finish();
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}
$('locate').addEventListener('click',locate);
locate();

// Background tabs may throttle timers; catch up when the page becomes visible.
function refreshIfDue() {
  if (!document.hidden && lastCoordinates && !loading && Date.now() - lastSuccessfulRefresh >= REFRESH_MS) {
    load(lastCoordinates.lat,lastCoordinates.lon,lastSelectedPlace);
  }
}
setInterval(refreshIfDue, 60 * 1000);
setInterval(updateTheme, 30 * 1000);
document.addEventListener('visibilitychange', () => { updateTheme(); refreshIfDue(); });
window.addEventListener('focus', refreshIfDue);
