'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server/index');

test('dashboard uses WeatherAPI when all Open-Meteo calls fail, then serves last-good data when every provider fails', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.WEATHERAPI_KEY;
  process.env.WEATHERAPI_KEY = 'test-key';
  let allFail = false;
  const today = new Date();
  const date = new Date(today.getTime() + 86400000).toISOString().slice(0,10);
  const hours = Array.from({length:48}, (_,i) => ({
    time_epoch: Math.floor(Date.now()/1000) + (i+1)*3600,
    temp_f: 65, condition:{text:'Clear'}, is_day:1, wind_mph:3, gust_mph:5
  }));
  const forecastday = [{date, day:{mintemp_f:50,maxtemp_f:70,condition:{text:'Clear'},daily_chance_of_rain:5},hour:hours}];
  const reply = body => ({ok:true,status:200,json:async()=>body});
  global.fetch = async (url,options) => {
    const host = new URL(String(url)).hostname;
    if (host === '127.0.0.1') return originalFetch(url,options);
    if (allFail || host === 'api.open-meteo.com' || host === 'api.weather.gov' || host === 'geocoding.geo.census.gov') throw new Error('simulated provider outage');
    if (host === 'api.weatherapi.com') {
      if (String(url).includes('forecast.json')) return reply({location:{name:'Test City',region:'Utah',tz_id:'America/Denver'},forecast:{forecastday}});
      return reply({location:{name:'Test City',region:'Utah'},current:{temp_f:66,feelslike_f:66,humidity:30,is_day:1,condition:{text:'Clear'}}});
    }
    throw new Error('unexpected provider: '+host);
  };
  const server = app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const url=base+'/api/dashboard?lat=37.128&lon=-113.612&refresh=1';
    const first=await originalFetch(url);
    assert.equal(first.status,200);
    const body=await first.json();
    assert.equal(body.sources.current,'WeatherAPI.com');
    assert.equal(body.sources.hourly,'WeatherAPI.com');
    assert.equal(body.sources.forecast,'WeatherAPI.com');
    assert.equal(body.forecast.timezone,'America/Denver');
    assert.equal(body.forecast.daily.time.length,1);
    allFail=true;
    const second=await originalFetch(url);
    assert.equal(second.status,200);
    const stale=await second.json();
    assert.equal(stale.stale,true);
    assert.equal(stale.forecast.current.temperature_2m,66);
  } finally {
    global.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.WEATHERAPI_KEY;
    else process.env.WEATHERAPI_KEY=originalKey;
    await new Promise(resolve=>server.close(resolve));
  }
});
