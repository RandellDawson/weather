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

Open http://localhost:3000 and allow browser geolocation when prompted. The app requests location automatically on page load; there are no manual coordinate inputs. Use Retry location if access fails. Browser geolocation requires HTTPS or localhost.

## Data sources

- **NWS (primary current conditions)**: latest actual observation from the first station returned for the requested point, within the contiguous United States. The main panel uses NWS when the observation is no more than 90 minutes old and includes a valid temperature. It shows the station and timestamp. Other NWS measurements are used when available; individual missing values may fall back to modeled values. Station readings can differ from conditions at the user's coordinates.
- **Open-Meteo**: modeled current conditions when NWS is stale/unavailable; hourly and 16-day forecasts. The modeled feels-like temperature and cloud cover remain labeled in the UI.
- **WeatherAPI.com (optional)**: retained server-side integration, but no longer overrides the main NWS current-conditions panel. The `WEATHERAPI_KEY` remains private.

`GET /api/dashboard?lat=37.0965&lon=-113.5684` aggregates the sources. Existing `/current` OpenWeather endpoint remains available for compatibility during migration. `/health` is unchanged.

The browser refreshes weather every 15 minutes while the page is active, and refreshes when a background tab becomes visible again if the data is stale. Routine refreshes reuse the last browser coordinates; the Refresh location button requests fresh device coordinates. A manual browser reload requests fresh data from providers, bypassing both dashboard and forecast caches using a one-time `refresh=1` request. This bypass is still subject to the API endpoint's rate limiter, and repeated reloads can consume provider quotas. Browsers may suspend timers in background tabs, particularly on mobile. The server caches dashboard responses for ten minutes and Open-Meteo hourly forecasts for 30 minutes and extended daily forecasts for 60 minutes per rounded coordinate pair, limits each forecast cache to 200 entries, and applies the existing request limiter and origin checks. These checks **do not authenticate callers**; a public website can still be scripted against. The provider key remains private, but a public backend cannot guarantee that no one consumes its quota. Add provider request budgeting before enabling WeatherAPI on a high-traffic site.

## First-pass limitations

- No NWS alerts or manual station selector yet.
- No automatic refresh, location favorites, or detailed hourly charts yet.
- NWS station errors do not prevent the forecast from loading.
- No live provider integration tests have been run in this PR.
- Existing production configuration and deployment are unchanged.

