require('dotenv').config();
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { getWeather } = require('./weather');
const { getDashboard } = require('./dashboard');
const { searchLocations } = require('./locationSearch');
const { restrictOrigin, apiLimiter, searchLimiter } = require('./apiProtection');

const app = express();
app.disable('x-powered-by');
const trustProxy = Number(process.env.TRUST_PROXY || 0);
if (trustProxy !== 0 && trustProxy !== 1) {
  throw new Error('TRUST_PROXY must be 0 or 1');
}
if (trustProxy === 1) app.set('trust proxy', 'loopback');

app.use(['/current', '/api/dashboard', '/api/locations/search'], restrictOrigin);
// Autocomplete is high-frequency; keep its quota separate from weather requests.
app.use(['/current', '/api/dashboard'], apiLimiter);
app.get('/api/dashboard', getDashboard);
app.get('/api/locations/search', searchLimiter, searchLocations);

app.get('/current', getWeather);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
// Generate asset versions from their actual contents, without a build step.
const staticDir = path.join(__dirname, '..', 'src');
const assetVersion = filename => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(staticDir, filename)))
  .digest('hex').slice(0, 12);
const htmlTemplate = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf8');
const html = htmlTemplate
  .replace('/style.css"', '/style.css?v=' + assetVersion('style.css') + '"')
  .replace('/index.js"', '/index.js?v=' + assetVersion('index.js') + '"');

app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.type('html').send(html);
});
app.use(express.static(staticDir, {
  index: false,
  dotfiles: 'deny',
  // Unversioned URLs must revalidate; versioned URLs still get a fresh
  // download because their query string changes with the file contents.
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache, must-revalidate')
}));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '127.0.0.1', () => console.log('Weather app listening at 127.0.0.1:' + port));
}
module.exports = app;
