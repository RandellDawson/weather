'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

function functions() {
  // Evaluate only the location helpers, not the DOM-dependent dashboard startup.
  const start = script.indexOf('const RECENT_KEY = ');
  const end = script.indexOf('function renderRecents()', start);
  assert(start >= 0 && end > start);
  const store = new Map();
  const context = vm.createContext({
    localStorage: {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value)},
    renderRecents: () => {},
    document: {},
  });
  vm.runInContext(script.slice(start, end).replace(/function saveRecents\(items\) \{[^\n]*\}/,
    "function saveRecents(items) { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0,5))); }"), context);
  // rememberLocation is declared after the DOM-based renderRecents function.
  // Load that helper separately so the VM tests the actual implementation.
  const rememberStart = script.indexOf('function rememberLocation(');
  const rememberEnd = script.indexOf('function clearSuggestions()', rememberStart);
  assert(rememberStart > end && rememberEnd > rememberStart);
  vm.runInContext(script.slice(rememberStart, rememberEnd), context);
  return {context, store, evaluate: expression => vm.runInContext(expression, context)};
}
const place = (id, name, region, zip) => ({id, name, region, lat:37.1, lon:-113.5, ...(zip ? {zip} : {})});

test('five recent locations are retained, newest first', () => {
  const {context, evaluate} = functions();
  for (let i=0;i<6;i++) context.rememberLocation({ ...place('city:'+i, 'Town'+i, 'Utah'), lat: 37.1 + i * 0.1, lon: -113.5 - i * 0.1 });
  const recent = evaluate('recentLocations()');
  assert.equal(recent.length, 5);
  assert.equal(recent[0].name, 'Town5');
  assert.equal(recent.at(-1).name, 'Town1');
});
test('two Paducah ZIP codes stay separate, and a repeated ZIP moves to first', () => {
  const {context, evaluate} = functions();
  const a = place('zip:42001:0','Paducah','KY','42001');
  const b = place('zip:42003:0','Paducah','KY','42003');
  context.rememberLocation(a);
  context.rememberLocation(b);
  assert.equal(evaluate('recentLocations()').length, 2);
  context.rememberLocation(a);
  assert.equal(evaluate('recentLocations()').length, 2);
  assert.equal(evaluate('recentLocations()')[0].zip, '42001');
  assert.equal(context.recentLabel(a), 'Paducah, KY (42001)');
});
test('city and ZIP search for same city are separate, city aliases deduplicate', () => {
  const {context, evaluate} = functions();
  context.rememberLocation(place('city:1','Paducah','Kentucky'));
  context.rememberLocation(place('zip:42001:0','Paducah','KY','42001'));
  context.rememberLocation(place('city:2','Paducah','KY'));
  assert.equal(evaluate('recentLocations()').length, 2);
  assert.equal(evaluate('recentLocations()')[0].id, 'city:2');
});
test('invalid and duplicated persisted locations are filtered', () => {
  const {store, evaluate} = functions();
  store.set('weather-recent-locations-v1', JSON.stringify([
    place('city:1','Paducah','KY'), place('city:2','Paducah','Kentucky'),
    {id:'invalid',lat:'bad',lon:0}, place('city:3','Other','Utah')
  ]));
  assert.equal(evaluate('recentLocations()').length, 2);
  store.set('weather-recent-locations-v1', 'not-json');
  assert.equal(evaluate('recentLocations()').length, 0);
});
test('selected location label overrides reverse-geocoded weather city', () => {
  assert.match(script, /selectedPlace\?\.name \|\| data\.location\?\.city/);
  assert.match(script, /selectedPlace\?\.region \|\| data\.location\?\.region/);
  assert.match(script, /render\(data,selectedPlace\)/);
  assert.match(script, /lastSelectedPlace=selectedPlace/);
});
test('autocomplete resets scroll after display and closes on outside click', () => {
  const start = script.indexOf('function showSuggestions(');
  const end = script.indexOf('async function findLocations(', start);
  const body = script.slice(start,end);
  assert(body.indexOf('list.hidden = !items.length') < body.indexOf('list.scrollTop = 0'));
  assert.match(script, /if \(!\$\('location-form'\)\.contains\(event\.target\)\) clearSuggestions\(\)/);
  assert.match(script, /\$\('location-suggestions'\)\.scrollTop = 0/);
});
test('autocomplete debounces, discards stale responses and supports keyboard navigation', () => {
  assert.match(script, /setTimeout\(async \(\) =>/);
  assert.match(script, /seq !== searchSequence/);
  assert.match(script, /clearTimeout\(searchTimer\)/);
  assert.match(script, /event\.key === 'ArrowDown'/);
  assert.match(script, /event\.key === 'ArrowUp'/);
  assert.match(script, /event\.key === 'Escape'/);
});
test('five visible suggestions are scrollable and recent buttons are compact', () => {
  assert.match(css, /\.location-suggestions\s*\{[^}]*max-height:\s*205px;[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.recent-chip button\s*\{[^}]*font-size:\s*\.74rem/);
});

test('recent-location clicks force a fresh dashboard request', () => {
  assert.match(script, /open\.addEventListener\('click', \(\) => chooseLocation\(place, true\)\)/);
  assert.match(script, /async function chooseLocation\(place, forceRefresh = false\)/);
  assert.match(script, /load\(place\.lat, place\.lon, place, forceRefresh\)/);
  assert.match(script, /const forceRefresh = reloadPending \|\| requestedRefresh/);
  assert.match(script, /refresh:'1'/);
});
