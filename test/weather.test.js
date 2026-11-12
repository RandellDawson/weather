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

test('maps all standard day/night weather icon codes', () => {
  const codes = ['01', '02', '03', '04', '09', '10', '11', '13', '50']
    .flatMap(code => [code + 'd', code + 'n']);
  const weather = { cod: 200, weather: codes.map(icon => ({ icon, description: 'weather' })) };
  const result = normalizeWeather(weather);
  assert.equal(result.cod, 200);
  for (let i = 0; i < codes.length; i++) {
    assert.equal(result.weather[i].icon, `https://openweathermap.org/img/wn/${codes[i]}@2x.png`);
    assert.equal(result.weather[i].description, 'weather');
    assert.equal(weather.weather[i].icon, codes[i]);
  }
});

test('preserves unrecognized icon values', () => {
  const weather = { weather: [{ icon: 'invalid' }, { icon: null }, { icon: '99d' }] };
  assert.deepEqual(normalizeWeather(weather).weather, weather.weather);
  assert.equal(normalizeWeather({ cod: 200 }).cod, 200);
});
