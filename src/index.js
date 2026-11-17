'use strict';
const $ = id => document.getElementById(id);
const codeText = c => ({0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',61:'Rain',63:'Rain',65:'Heavy rain',71:'Snow',73:'Snow',75:'Heavy snow',80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorms'})[c] || 'Variable conditions';
const val = (x, unit = '') => x == null ? '—' : x + unit;
function metric(label, value) { const box=document.createElement('div');box.className='metric';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(small,strong);return box; }
function card(parent, className, values) { const box=document.createElement('div');box.className=className;for(const [tag,text] of values){const node=document.createElement(tag);node.textContent=text;box.append(node);}parent.append(box); }
function render(data) {
  const f=data.forecast, c=f.current, w=data.weatherapi;
  $('location').textContent=data.coordinates.latitude.toFixed(5)+', '+data.coordinates.longitude.toFixed(5)+' · '+f.timezone;
  $('temperature').textContent=val(w?.temp_f ?? c.temperature_2m,'°F');
  $('conditions').textContent=w?.condition?.text || codeText(c.weather_code);
  $('source').textContent=(w?'WeatherAPI.com estimated current conditions':'Open-Meteo modeled current conditions')+' · '+(w?.last_updated || c.time);
  const m=$('metrics');m.replaceChildren();
  [['Feels like',val(w?.feelslike_f ?? c.apparent_temperature,'°F')],['Humidity',val(w?.humidity ?? c.relative_humidity_2m,'%')],['Wind',val(w?.wind_mph ?? c.wind_speed_10m,' mph')],['Gust',val(w?.gust_mph,' mph')],['Dew point',val(w?.dewpoint_f,'°F')],['Pressure',val(w?.pressure_in,' inHg')],['Cloud cover',val(w?.cloud ?? c.cloud_cover,'%')],['UV index',val(w?.uv)]].forEach(([a,b])=>m.append(metric(a,b)));
  const h=$('hourly');h.replaceChildren();
  const times=f.hourly.time;let start=times.findIndex(t=>t>=c.time.slice(0,13)+':00');if(start<0)start=0;
  for(let i=start;i<Math.min(start+24,times.length);i++){const date=new Date(times[i]+'Z');card(h,'hour',[['small',new Intl.DateTimeFormat('en-US',{hour:'numeric',timeZone:'UTC'}).format(date)],['strong',val(Math.round(f.hourly.temperature_2m[i]),'°')],['small',codeText(f.hourly.weather_code[i])],['small',val(f.hourly.precipitation_probability[i],'% rain')]]);}
  const d=$('daily');d.replaceChildren();
  f.daily.time.forEach((date,i)=>card(d,'day',[['small',date],['strong',Math.round(f.daily.temperature_2m_max[i])+'° / '+Math.round(f.daily.temperature_2m_min[i])+'°'],['span',codeText(f.daily.weather_code[i])],['p',val(f.daily.precipitation_probability_max[i],'% rain')]]));
  const station=data.nws;
  $('station').textContent=station?.observation ? station.station.name+': '+(station.observation.temperature?.value==null?'Temperature unavailable':(station.observation.temperature.value*9/5+32).toFixed(1)+'°F')+' · observed '+(station.observation.timestamp||'unknown time') : 'No current NWS station observation available for these coordinates.';
}
async function load(lat,lon) {
  $('status').textContent='Loading weather…';
  try{const response=await fetch('/api/dashboard?'+new URLSearchParams({lat,lon}));const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');render(data);$('status').textContent='Updated '+new Date(data.fetchedAt).toLocaleTimeString();}
  catch(e){$('status').textContent='Unable to load weather: '+e.message;}
}
$('coordinates').addEventListener('submit',e=>{e.preventDefault();load($('lat').value,$('lon').value);});
$('locate').addEventListener('click',()=>{if(!navigator.geolocation){$('status').textContent='Geolocation is not supported.';return;}navigator.geolocation.getCurrentPosition(p=>{const {latitude,longitude}=p.coords;$('lat').value=latitude;$('lon').value=longitude;load(latitude,longitude);},()=>{$('status').textContent='Location permission unavailable. Enter coordinates instead.';},{enableHighAccuracy:true,timeout:12000});});
