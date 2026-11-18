'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server/index');

test('HTML references content-versioned assets and requires revalidation', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base + '/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-cache/);
    const html = await response.text();
    for (const asset of ['style.css', 'index.js']) {
      const match = html.match(new RegExp('/' + asset.replace('.', '\\.') + '\\?v=([a-f0-9]{12})'));
      assert.ok(match, asset + ' has a content version');
      const assetResponse = await fetch(base + '/' + asset + '?v=' + match[1]);
      assert.equal(assetResponse.status, 200);
      assert.match(assetResponse.headers.get('cache-control'), /no-cache/);
    }
    const direct = await fetch(base + '/index.html');
    assert.equal(direct.status, 200);
    assert.match(direct.headers.get('cache-control'), /no-cache/);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
