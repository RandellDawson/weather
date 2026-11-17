const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server/index');

async function withServer(fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const address = server.address();
    await fn('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

test('serves redesigned weather dashboard and health check', async () => withServer(async base => {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  for (const id of ['locate', 'status', 'temperature', 'hourly', 'daily', 'metrics']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /id="weather-info"|<h1>Weather dashboard<\/h1>/);
  const css = await fetch(base + '/style.css');
  assert.equal(css.status, 200);
  const stylesheet = await css.text();
  assert.match(stylesheet, /\.current-toolbar/);
  assert.match(stylesheet, /\.days/);
  assert.match(stylesheet, /data-theme="day"/);
  const health = await fetch(base + '/health');
  assert.deepEqual(await health.json(), { status: 'ok' });
}));

test('blocks cross-origin API calls', async () => withServer(async base => {
  for (const path of ['/current?lat=37&lon=-113']) {
    const resp = await fetch(base + path, { headers: { Origin: 'https://evil.example' } });
    assert.equal(resp.status, 403);
    const crossSite = await fetch(base + path, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(crossSite.status, 403);
  }
}));

test('rejects invalid weather coordinates', async () => withServer(async base => {
  const resp = await fetch(base + '/current?lat=999&lon=0', {
    headers: { Origin: 'http://localhost:3000' }
  });
  assert.equal(resp.status, 400);
}));

test('does not expose an IP geolocation endpoint or frontend fallback', async () => withServer(async base => {
  const location = await fetch(base + '/location');
  assert.equal(location.status, 404);
  const script = await fetch(base + '/index.js');
  const source = await script.text();
  assert.doesNotMatch(source, /getLocationByIP|fetch\(['"]\/location/);
  assert.match(source, /navigator\.geolocation\.getCurrentPosition/);
}));
