require('dotenv').config();
const express = require('express');
const path = require('node:path');
const { getWeather } = require('./weather');
const { restrictOrigin, apiLimiter } = require('./apiProtection');

const app = express();
app.disable('x-powered-by');
const trustProxy = Number(process.env.TRUST_PROXY || 0);
if (trustProxy !== 0 && trustProxy !== 1) {
  throw new Error('TRUST_PROXY must be 0 or 1');
}
if (trustProxy === 1) app.set('trust proxy', 1);

app.use(['/current', '/location'], restrictOrigin, apiLimiter);

app.get('/current', getWeather);
app.get('/location', async (req, res) => {
  const key = process.env.IPGEO_API_KEY;
  if (!key) return res.status(503).json({ error: 'Geolocation is not configured' });
  try {
    // For the IP fallback use the actual visitor IP, not the server's IP.
    // Only trust X-Forwarded-For after configuring a trusted Nginx proxy.
    const ip = req.ip;
    if (!ip || !require('node:net').isIP(ip)) {
      return res.status(400).json({ error: 'Unable to determine visitor IP' });
    }
    const url = new URL('https://api.ipgeolocation.io/ipgeo');
    url.searchParams.set('apiKey', key);
    url.searchParams.set('ip', ip);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Geolocation provider HTTP ' + response.status);
    const data = await response.json();
    const latitude = Number(data.latitude), longitude = Number(data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('Invalid geolocation coordinates');
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ latitude, longitude });
  } catch (error) {
    console.error('Geolocation failed:', error.message);
    return res.status(502).json({ error: 'Unable to determine location' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(express.static(path.join(__dirname, '..', 'src'), {
  index: 'index.html',
  dotfiles: 'deny'
}));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '127.0.0.1', () => console.log('Weather app listening at 127.0.0.1:' + port));
}
module.exports = app;
