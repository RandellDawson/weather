const ZIP_RE = /^\d{5}$/;
const CITY_RE = /^[\p{L}\p{M} .,'-]{3,80}$/u;
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
  // The search box may contain a previously selected 'City, State' label.
  // Search by city while retaining the state portion for result filtering.
  const [cityPart, ...regionParts] = q.split(',');
  const cityQuery = cityPart.trim();
  const regionQuery = regionParts.join(',').trim().toLowerCase();
  if (cityQuery.length < 3) return [];
  // Expand a partially typed airport suffix before querying the geocoder.
  const airportIntent = /\s+(?:airp|airpo|airpor|airport)$/i.test(cityQuery);
  const lookupCity = airportIntent ? cityQuery.replace(/\s+airp(?:o(?:r(?:t)?)?)?$/i, ' Airport') : cityQuery;
  // Search common U.S. place-name spellings without requiring exact punctuation.
  // Limit variants to keep geocoding requests predictable.
  const names = new Set([lookupCity, lookupCity.replace(/\./g, '').replace(/\s+/g, ' ').trim()]);
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
  // Search airport variants independently; airports often have a different
  // official name from the nearby town and rank poorly in generic searches.
  const airportNames = new Set();
  for (const name of [...names].slice(0, 2)) {
    const base = name.replace(/\s+(?:municipal|regional)?\s*airport$/i, '').trim();
    for (const suffix of ['Airport', 'Municipal Airport', 'Regional Airport']) {
      airportNames.add(base + ' ' + suffix);
    }
  }
  // A geocoder may not index a multiword partial phrase such as "st geor".
  // Also search the final word as a prefix and filter matches below.
  const trailingWord = lookupCity.split(/\s+/).at(-1);
  const queries = [...new Set([...names, ...airportNames, ...(trailingWord.length >= 3 && !airportIntent ? [trailingWord] : [])])].slice(0, 8);
  const responses = await Promise.all(queries.map(async name => {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', name);
    url.searchParams.set('count', '30');
    url.searchParams.set('language', 'en');
    url.searchParams.set('countryCode', 'US');
    return readJson(url);
  }));
  const normalizeTerms = value => String(value).toLowerCase()
    .replace(/\bst\.?\b/g, 'saint').replace(/\bft\.?\b/g, 'fort')
    .replace(/\bmt\.?\b/g, 'mount').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
  const requestedTerms = normalizeTerms(lookupCity).filter(word =>
    !['airport', 'municipal', 'regional', 'airfield', 'airstrip'].includes(word));
  const matchesQuery = name => {
    const terms = new Set(normalizeTerms(name));
    return requestedTerms.every(word => [...terms].some(term => term.startsWith(word)));
  };
  const seen = new Set();
  const seenNames = new Set();
  const cities = [];
  const airports = [];
  for (const data of responses) {
    for (const r of data?.results || []) {
      if (r.country_code !== 'US') continue;
      if (regionQuery && !String(r.admin1 || '').toLowerCase().startsWith(regionQuery)) continue;
      // Include populated places and clearly named airports in the same list.
      // Other geographic features can produce misleading city-search matches.
      const airport = /\b(?:airport|airfield|airstrip)\b/i.test(r.name) || /^AIR/i.test(r.feature_code || '');
      const populated = !r.feature_code || /^PPL/i.test(r.feature_code);
      if (!airport && !populated) continue;
      if (airportIntent && !airport) continue;
      if (!matchesQuery(r.name)) continue;
      const place = normalize({
        id: 'city:' + r.id, name: r.name, region: r.admin1,
        latitude: r.latitude, longitude: r.longitude
      });
      if (!place || seen.has(place.id)) continue;
      // Geocoder may return separate IDs for St/Saint spellings of one airport.
      // Keep the first matching name within the same state; never merge ZIPs here.
      const nameKey = normalizeTerms(place.name).join(' ') + ':' + String(place.region || '').toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seen.add(place.id);
      seenNames.add(nameKey);
      (airport ? airports : cities).push(place);
    }
  }
  // Reserve slots for airports even when many towns share the searched name.
  // Keep a single ungrouped suggestion list, with populated places first.
  return [...cities.slice(0, 12), ...airports.slice(0, 8)].slice(0, 20);
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
