const ZIP_RE = /^\d{5}$/;
const CITY_RE = /^[\p{L}\p{M} .'-]{3,80}$/u;
const timeout = 8000;
async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Location lookup failed');
  return response.json();
}
function normalize(entry) {
  const lat = Number(entry.latitude), lon = Number(entry.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 24 || lat > 50 || lon < -125 || lon > -66) return null;
  return { id: entry.id || 'zip:' + entry.zip, name: entry.name, region: entry.region, ...(entry.zip ? {zip: entry.zip} : {}), lat, lon };
}
async function lookup(query) {
  const q = String(query || '').trim();
  if (ZIP_RE.test(q)) {
    const data = await readJson('https://api.zippopotam.us/us/' + q);
    if (!data?.places?.length) return [];
    return data.places.map((p, i) => normalize({
      id: 'zip:' + q + ':' + i, zip: q, name: p['place name'], region: p['state abbreviation'],
      latitude: p.latitude, longitude: p.longitude
    })).filter(Boolean).slice(0, 8);
  }
  if (!CITY_RE.test(q)) return [];
  // Search common U.S. place-name spellings without requiring exact punctuation.
  // Limit variants to keep geocoding requests predictable.
  const names = new Set([q, q.replace(/\./g, '').replace(/\s+/g, ' ').trim()]);
  const aliases = [
    [/^st\.?\s+/i, 'Saint '], [/^saint\s+/i, 'St '],
    [/^ft\.?\s+/i, 'Fort '], [/^fort\s+/i, 'Ft '],
    [/^mt\.?\s+/i, 'Mount '], [/^mount\s+/i, 'Mt ']
  ];
  for (const name of [...names]) {
    for (const [pattern, replacement] of aliases) {
      if (pattern.test(name)) {
        const alternate = name.replace(pattern, replacement);
        names.add(alternate);
        names.add(alternate.replace(/\./g, ''));
      }
    }
  }
  const responses = await Promise.all([...names].map(async name => {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', name);
    url.searchParams.set('count', '20');
    url.searchParams.set('language', 'en');
    url.searchParams.set('countryCode', 'US');
    return readJson(url);
  }));
  const seen = new Set();
  const cities = [];
  const airports = [];
  for (const data of responses) {
    for (const r of data?.results || []) {
      if (r.country_code !== 'US') continue;
      // Include populated places and clearly named airports in the same list.
      // Other geographic features can produce misleading city-search matches.
      const airport = /\b(?:airport|airfield|airstrip)\b/i.test(r.name) || /^AIR/i.test(r.feature_code || '');
      const populated = !r.feature_code || /^PPL/i.test(r.feature_code);
      if (!airport && !populated) continue;
      const place = normalize({
        id: 'city:' + r.id, name: r.name, region: r.admin1,
        latitude: r.latitude, longitude: r.longitude
      });
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      (airport ? airports : cities).push(place);
    }
  }
  // Reserve slots for airports even when many towns share the searched name.
  // Keep a single ungrouped suggestion list, with populated places first.
  return [...cities.slice(0, 5), ...airports.slice(0, 3)].slice(0, 8);
}
function queryParam(req) { return typeof req.query.q === 'string' ? req.query.q.trim() : ''; }
async function searchLocations(req, res) {
  const q = queryParam(req);
  if (q.length > 80 || (q.length >= 3 && !ZIP_RE.test(q) && !CITY_RE.test(q))) {
    return res.status(400).json({ error: 'Enter a valid U.S. city or five-digit ZIP code.' });
  }
  if (q.length < 3) return res.json({ results: [] });
  if (/^\d+$/.test(q) && !ZIP_RE.test(q)) return res.json({ results: [] });
  try { return res.json({ results: await lookup(q) }); }
  catch (error) { console.warn('Location search unavailable:', error.message); return res.status(502).json({ error: 'Location search is temporarily unavailable. Please retry.' }); }
}
module.exports = { searchLocations };
