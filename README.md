# Weather

Standalone Node.js 24 / Express website and weather API for `weather.randelldawson.com`.

The original design remains in `src/index.html` and `src/style.css`, served as static files. Native browser JavaScript replaces the old Webpack 4 toolchain.

## Local setup

```bash
nvm use
npm install
cp .env.example .env
# Add API_URL, API_KEY and IPGEO_API_KEY to .env, without committing secrets.
npm test
npm start
```

Open http://localhost:3000. The server listens on `127.0.0.1` only.

## Endpoints

- `/`: weather webpage
- `/current?lat=37.1&lon=-113.5`: OpenWeather-compatible JSON
- `/location`: server-side IP geolocation fallback
- `/health`: basic health check

Browser geolocation is preferred. The fallback uses IP geolocation if enabled.

## Security

- CORS access isn't opened to other origins. Cross-origin browser requests with disallowed Origin, Referer, or Sec-Fetch-Site headers are rejected.
- These checks are *not* authentication. HTTP clients can forge or omit headers. Public API endpoints are still callable from scripts.
- Shared rate limiting: 60 requests per 15 minutes per client IP across `/current` and `/location`. Single-process in-memory limiter; upgrade to shared storage if scaling to multiple workers.
- Keep upstream weather and geolocation keys in .env; rotate the previously exposed geolocation API key.
- The application only binds localhost. Put Nginx HTTPS in front of it, and do not expose the Node port.
- `TRUST_PROXY=1` only with trusted local Nginx forwarding client IP, e.g. `proxy_set_header X-Forwarded-For $remote_addr;`; ensure direct access to the Node port is blocked. No broad untrusted proxy setting.
- For stronger prevention of automated extraction, use proxy-level WAF / bot control or authentication. A public anonymous website cannot absolutely prevent scraping.
- The existing weather icons use third-party Glitch URLs, preserved for visual compatibility.

This branch does not deploy production or remove the legacy API.
