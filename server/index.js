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
if (trustProxy === 1) app.set('trust proxy', 'loopback');

app.use('/current', restrictOrigin, apiLimiter);

app.get('/current', getWeather);
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
