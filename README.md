# Weather dashboard (first-pass redesign)

Node.js 24 / Express application for weather.randelldawson.com.

## Development

```bash
nvm use
npm install
cp .env.example .env
# Optional: add WEATHERAPI_KEY=... to .env for current-condition estimates
npm test
npm start
```

Open http://localhost:3000 and allow geolocation or enter coordinates manually.

## Data sources

- **WeatherAPI.com (optional)**: current-condition estimate at supplied coordinates, using a server-side `WEATHERAPI_KEY`. The key is never returned to the browser.
- **Open-Meteo**: modeled current conditions when WeatherAPI is not configured; hourly and 16-day forecasts.
- **NWS**: latest actual observation from the first station returned for the requested point, within the contiguous United States. Observations may be delayed, unavailable, or differ from conditions at the coordinates.

`GET /api/dashboard?lat=37.0965&lon=-113.5684` aggregates the sources. Existing `/current` OpenWeather endpoint remains available for compatibility during migration. `/health` is unchanged.

The server caches dashboard responses for ten minutes per rounded coordinate pair, limits the cache to 200 entries, and applies the existing request limiter and origin checks. These checks **do not authenticate callers**; a public website can still be scripted against. The provider key remains private, but a public backend cannot guarantee that no one consumes its quota. Add provider request budgeting before enabling WeatherAPI on a high-traffic site.

## First-pass limitations

- No NWS alerts or manual station selector yet.
- No automatic refresh, location favorites, or detailed hourly charts yet.
- NWS station errors do not prevent the forecast from loading.
- No live provider integration tests have been run in this PR.
- Existing production configuration and deployment are unchanged.

