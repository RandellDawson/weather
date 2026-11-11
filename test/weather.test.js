const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateCoords, normalizeWeather } = require('../server/weather');

test('validates latitude and longitude', () => {
  assert.equal(validateCoords('37.1', '-113.5'), true);
  assert.equal(validateCoords('0', '0'), true);
  for (const [a, b] of [['', '0'], ['91', '0'], ['0', '-181'],
    ['NaN', '0'], ['Infinity', '0'], [undefined, '2'], ['2', ['3']]]) {
    assert.equal(validateCoords(a, b), false);
  }
});

test('preserves weather structure and maps icon', () => {
  const weather = { cod: 200, weather: [{ icon: '01d', description: 'clear' }] };
  const result = normalizeWeather(weather);
  assert.equal(result.cod, 200);
  assert.match(result.weather[0].icon, /^https:\/\//);
  assert.equal(result.weather[0].description, 'clear');
  assert.equal(weather.weather[0].icon, '01d');
});
