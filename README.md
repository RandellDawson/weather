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

## Data sources and priorities

- **Current conditions:** fresh NWS station observation (up to 90 minutes old and with a valid temperature), then WeatherAPI.com when `WEATHERAPI_KEY` is configured, then Open-Meteo. The backend checks up to five nearby NWS stations in distance order and prefers a usable observation. The UI identifies the source, station and observation time.
- **Next 24 hours:** NWS hourly forecast at the requested coordinates, then WeatherAPI.com hourly forecast, then Open-Meteo. NWS must provide at least 24 future periods with usable temperatures and descriptions. WeatherAPI hourly coverage depends on the account's forecast access. The UI labels the chosen source and displays condition icons.
- **16-day outlook:** Open-Meteo.
- **Other current metrics:** NWS values where present, otherwise WeatherAPI or Open-Meteo estimates. Feels-like and cloud cover may be modeled.
- **Key security:** `WEATHERAPI_KEY` is only read by the Node.js server, never sent to browsers.

`GET /api/dashboard?lat=37.0965&lon=-113.5684` aggregates the sources. Existing `/current` OpenWeather endpoint remains available for compatibility during migration. `/health` is unchanged.

The browser refreshes weather every 15 minutes while the page is active, and refreshes when a background tab becomes visible again if the data is stale. Routine refreshes reuse the last browser coordinates; the Refresh location button requests fresh device coordinates. A manual browser reload requests fresh data from providers, bypassing both dashboard and forecast caches using a one-time `refresh=1` request. This bypass is still subject to the API endpoint's rate limiter, and repeated reloads can consume provider quotas. Browsers may suspend timers in background tabs, particularly on mobile. The server caches dashboard responses for ten minutes and hourly forecasts from NWS, WeatherAPI.com and Open-Meteo for 30 minutes and extended daily forecasts for 60 minutes per rounded coordinate pair, limits each forecast cache to 200 entries, and applies the existing request limiter and origin checks. These checks **do not authenticate callers**; a public website can still be scripted against. The provider key remains private, but a public backend cannot guarantee that no one consumes its quota. Add provider request budgeting before enabling WeatherAPI on a high-traffic site.

## First-pass limitations

- No NWS alerts or manual station selector yet.
- No location favorites or detailed hourly charts yet.
- NWS station errors do not prevent the forecast from loading.
- No live provider integration tests have been run in this PR.
- Existing production configuration and deployment are unchanged.

