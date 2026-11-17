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
function render(data) {
  const f=data.forecast, c=f.current, w=data.weatherapi;
  $('location').textContent=data.coordinates.latitude.toFixed(5)+', '+data.coordinates.longitude.toFixed(5)+' · '+f.timezone;
  const station=data.nws;
  const obs=station?.observation;
  const observedAt=obs?.timestamp ? Date.parse(obs.timestamp) : NaN;
  // Reject missing, future, or stale observations; keep the forecast usable.
  const useNws = Number.isFinite(observedAt) && Date.now() - observedAt >= -5 * 60 * 1000 && Date.now() - observedAt <= 90 * 60 * 1000 && typeof obs.temperature?.value === 'number';
  const isDay=c.is_day !== 0;
  const description=obs?.textDescription?.trim();
  $('temperature').textContent=useNws ? nwsValue(obs.temperature.value, x => x * 9 / 5 + 32, '°F') : val(c.temperature_2m,'°F');
  const icon=iconNode(c.weather_code,isDay);
  if (useNws && description) {icon.textContent=nwsConditionIcon(description,isDay);icon.setAttribute('aria-label',description);}
  $('current-icon').replaceChildren(icon);
  $('conditions').textContent=useNws ? (description || 'Observed conditions') : codeText(c.weather_code);
  $('source').textContent=useNws
    ? 'NWS observed at ' + station.station.name + ' · ' + new Date(observedAt).toLocaleString()
    : 'Open-Meteo modeled current conditions · ' + c.time + (obs ? ' · NWS observation unavailable or stale' : '');
  const m=$('metrics');m.replaceChildren();
  const obsMetric=(field, convert, unit, fallback) => useNws ? (nwsValue(obs[field]?.value,convert,unit) ?? fallback) : fallback;
  [
    ['Feels like',val(c.apparent_temperature,'°F')],
    ['Humidity',obsMetric('relativeHumidity',x=>x,'%',val(c.relative_humidity_2m,'%'))],
    ['Wind',obsMetric('windSpeed',x=>x*2.236936,' mph',val(c.wind_speed_10m,' mph'))],
    ['Gust',obsMetric('windGust',x=>x*2.236936,' mph','—')],
    ['Dew point',obsMetric('dewpoint',x=>x*9/5+32,'°F','—')],
    ['Pressure',obsMetric('barometricPressure',x=>x/3386.389,' inHg','—')],
    ['Cloud cover',val(c.cloud_cover,'%')]
  ].forEach(([a,b])=>m.append(metric(a,b)));
  const h=$('hourly');h.replaceChildren();
  const times=f.hourly.time;let start=times.findIndex(t=>t>=c.time.slice(0,13)+':00');if(start<0)start=0;
  for(let i=start;i<Math.min(start+24,times.length);i++){const date=new Date(times[i]+'Z');card(h,'hour',[['small',new Intl.DateTimeFormat('en-US',{hour:'numeric',timeZone:'UTC'}).format(date)],['strong',val(Math.round(f.hourly.temperature_2m[i]),'°')],['small',codeText(f.hourly.weather_code[i])],['small',val(f.hourly.precipitation_probability[i],'% rain')]]);const hour=h.lastElementChild;hour.insertBefore(iconNode(f.hourly.weather_code[i],f.hourly.is_day?.[i] !== 0),hour.children[1]);}
  const d=$('daily');d.replaceChildren();
  f.daily.time.forEach((date,i)=>{card(d,'day',[['small',date],['strong',Math.round(f.daily.temperature_2m_max[i])+'° / '+Math.round(f.daily.temperature_2m_min[i])+'°'],['span',codeText(f.daily.weather_code[i])],['p',val(f.daily.precipitation_probability_max[i],'% rain')]]);const day=d.lastElementChild;day.insertBefore(iconNode(f.daily.weather_code[i]),day.children[1]);});
  $('station').textContent=obs ? station.station.name+': '+(obs.temperature?.value==null?'Temperature unavailable':(obs.temperature.value*9/5+32).toFixed(1)+'°F')+' · observed '+(obs.timestamp||'unknown time')+(useNws?' · Used for current conditions':' · Not used for current conditions (missing or stale temperature)') : 'No current NWS station observation available for these coordinates.';
}
const REFRESH_MS = 15 * 60 * 1000;
let lastCoordinates = null;
let lastSuccessfulRefresh = 0;
let loading = false;
// A browser navigation reload triggers one uncached provider fetch.
let reloadPending = performance.getEntriesByType('navigation').some(entry => entry.type === 'reload');
async function load(lat,lon) {
  if (loading) return;
  loading = true;
  $('status').textContent='Loading weather…';
  const forceRefresh = reloadPending;
  reloadPending = false;
  try{const response=await fetch('/api/dashboard?'+new URLSearchParams({lat,lon,...(forceRefresh?{refresh:'1'}:{})}),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');render(data);lastCoordinates={lat,lon};lastSuccessfulRefresh=Date.now();$('status').textContent='Updated '+new Date(data.fetchedAt).toLocaleTimeString();}
  catch(e){$('status').textContent='Unable to load weather: '+e.message;}
  finally{loading=false;}
}
function locate() {
  const button = $('locate');
  button.disabled = true;
  button.textContent = 'Updating…';
  const finish = () => { button.disabled = false; button.textContent = '↻ Refresh location'; };
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
    load(lastCoordinates.lat,lastCoordinates.lon);
  }
}
setInterval(refreshIfDue, 60 * 1000);
document.addEventListener('visibilitychange', refreshIfDue);
window.addEventListener('focus', refreshIfDue);
