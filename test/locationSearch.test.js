'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server/index');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

const city = (id, name, admin1, feature_code = 'PPL', latitude = 37.1, longitude = -113.5) =>
  ({ id, name, admin1, feature_code, country_code: 'US', latitude, longitude });
const fixtures = [
  city(1, 'St. George', 'Utah'),
  city(2, 'Saint George', 'South Carolina', 'PPL', 33.2, -80.6),
  city(3, 'St George Municipal Airport', 'Utah', 'AIRP'),
  city(4, 'Saint George Municipal Airport', 'Utah', 'AIRP'),
  city(5, 'St George Airport', 'South Carolina', 'AIRP', 33.2, -80.6),
  city(6, 'Sunset Acres Airport', 'Illinois', 'AIRP', 40.1, -89.1),
  city(7, 'Fort Worth', 'Texas', 'PPL', 32.7, -97.3),
  city(8, 'Mount Pleasant', 'South Carolina', 'PPL', 32.8, -79.8),
  city(9, 'Paducah', 'Kentucky', 'PPL', 37.08, -88.6),
  city(10, 'Paducah Airport', 'Kentucky', 'AIRP', 37.07, -88.77),
  ...Array.from({length: 25}, (_, i) => city(100+i, 'Georgetown ' + i, 'Texas', 'PPL', 30.6, -97.7))
];
function mockGeocoder() {
  let calls = [];
  global.fetch = async url => {
    const parsed = new URL(String(url));
    calls.push(parsed);
    if (parsed.hostname === 'api.zippopotam.us') {
      const zip = parsed.pathname.split('/').pop();
      return { ok: true, status: 200, json: async () => ({places:[{'place name':'Paducah','state abbreviation':'KY',latitude:37.08,longitude:zip === '42001' ? -88.6 : -88.55}]}) };
    }
    if (parsed.hostname !== 'geocoding-api.open-meteo.com') throw Error('Unexpected fetch: ' + url);
    return { ok: true, status: 200, json: async () => ({results: fixtures}) };
  };
  return calls;
}
async function withServer(fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { return await fn('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
async function search(base, q) {
  const response = await originalFetch(base + '/api/locations/search?' + new URLSearchParams({q}));
  return {status:response.status, body:await response.json()};
}
test('ZIP lookups preserve distinct ZIP identities for the same city', async () => {
  mockGeocoder();
  await withServer(async base => {
    const a = await search(base, '42001'), b = await search(base, '42003');
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.results[0].name, 'Paducah');
    assert.equal(b.body.results[0].name, 'Paducah');
    assert.equal(a.body.results[0].zip, '42001');
    assert.equal(b.body.results[0].zip, '42003');
    assert.notEqual(a.body.results[0].id, b.body.results[0].id);
  });
});
test('city searches include airports but suppress St/Saint aliases in the same state', async () => {
  mockGeocoder();
  await withServer(async base => {
    const {body} = await search(base, 'st george');
    assert(body.results.some(p => p.name === 'St. George' && p.region === 'Utah'));
    assert.equal(body.results.filter(p => /municipal airport/i.test(p.name) && p.region === 'Utah').length, 1);
    assert(body.results.some(p => p.name === 'St George Airport' && p.region === 'South Carolina'));
    assert(!body.results.some(p => p.name === 'Sunset Acres Airport'));
  });
});
test('partial airport searches find municipal airports without unrelated matches', async () => {
  mockGeocoder();
  await withServer(async base => {
    const {body} = await search(base, 'Saint George airpor');
    assert(body.results.some(p => /municipal airport/i.test(p.name) && p.region === 'Utah'));
    assert(body.results.every(p => /airport|airfield|airstrip/i.test(p.name)));
    assert(!body.results.some(p => /Sunset Acres/.test(p.name)));
  });
});
test('St/Saint, Ft/Fort, Mt/Mount and partial words are recognized', async () => {
  const calls = mockGeocoder();
  await withServer(async base => {
    for (const [q, name] of [['st geor','St. George'], ['ft worth','Fort Worth'], ['mt pleasant','Mount Pleasant'], ['pad','Paducah']]) {
      const {body} = await search(base, q);
      assert(body.results.some(p => p.name === name), q + ' should match ' + name);
    }
    assert(calls.some(url => url.searchParams.get('name') === 'Saint geor'));
  });
});
test('selected city and incomplete state labels are accepted', async () => {
  mockGeocoder();
  await withServer(async base => {
    for (const q of ['Saint George, South Carolina','Saint George, South Carol']) {
      const {status,body} = await search(base, q);
      assert.equal(status, 200);
      assert(body.results.some(p => p.region === 'South Carolina'));
      assert(body.results.every(p => p.region === 'South Carolina'));
    }
  });
});
test('search results are capped at twenty, with airport suggestions retained', async () => {
  mockGeocoder();
  await withServer(async base => {
    const {body} = await search(base, 'geo');
    assert(body.results.length <= 20);
    assert(body.results.some(p => /airport/i.test(p.name)));
  });
});
test('rejects invalid query, handles short ZIPs, and blocks cross-site search', async () => {
  mockGeocoder();
  await withServer(async base => {
    assert.equal((await search(base, 'abc@def')).status, 400);
    // Four-digit numeric queries are rejected by server validation.\n    const incompleteZip = await search(base, '4200');\n    assert.equal(incompleteZip.status, 400);\n    assert.match(incompleteZip.body.error, /valid U\\.S\\. city|ZIP code/);
    const crossSite = await originalFetch(base + '/api/locations/search?q=paducah', {headers:{Origin:'https://evil.example'}});
    assert.equal(crossSite.status, 403);
  });
});
test('autocomplete requests have independent quota from weather requests', async () => {
  mockGeocoder();
  await withServer(async base => {
    for (let i=0;i<65;i++) assert.equal((await search(base,'paducah')).status, 200);
    const weather = await originalFetch(base + '/current?lat=999&lon=0');
    assert.equal(weather.status, 400);
  });
});
