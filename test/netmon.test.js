'use strict';
// Connessione Internet: riassunto del ping, perdita di pacchetti, giudizio e lettura del Wi-Fi.
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { NetMonitor, summarize, verdict, parseWlan, tcpPing, WINDOW } = require('../src/system/netmon');

test('riassunto: media, minimo, massimo, sbalzi e perdita', () => {
  const s = summarize([20, 30, null, 25]);
  assert.deepStrictEqual(s, { current: 25, avg: 25, min: 20, max: 30, jitter: 8, loss: 25, count: 4 });
  assert.strictEqual(summarize([]).count, 0);
  assert.strictEqual(summarize([null, null]).avg, null);
  assert.strictEqual(summarize([null, null]).loss, 100);
});

test('giudizio: offline, instabile, lento, buono', () => {
  assert.strictEqual(verdict(summarize([])).level, 'wait');
  assert.strictEqual(verdict(summarize([null, null])).level, 'bad');
  assert.strictEqual(verdict(summarize([20, null, 20, 20, 20, 20, 20, 20, 20, 20])).level, 'bad'); // 10% persi
  assert.strictEqual(verdict(summarize([150, 160, 155])).level, 'mid');
  assert.strictEqual(verdict(summarize([18, 20, 19, 21])).level, 'good');
});

test('Wi-Fi: nome e segnale da netsh in italiano e in inglese (BSSID non scambiato per SSID)', () => {
  const it = '    Nome                   : Wi-Fi\n    SSID                   : Casa Raul\n    BSSID                  : aa:bb:cc:dd:ee:ff\n    Segnale                : 87%\n';
  assert.deepStrictEqual(parseWlan(it), { ssid: 'Casa Raul', signal: 87 });
  const en = '    SSID                   : Home\n    AP BSSID               : aa:bb\n    Signal                 : 54%\n';
  assert.deepStrictEqual(parseWlan(en), { ssid: 'Home', signal: 54 });
  assert.deepStrictEqual(parseWlan(''), { ssid: null, signal: null });
});

test('il monitor tiene un minuto di campioni e usa il server di riserva', async () => {
  const seen = [];
  const probe = async (host) => { seen.push(host); return host === '1.1.1.1' ? null : 30; };
  let last = null;
  const m = new NetMonitor({ probe, onTick: (n) => { last = n; }, rates: () => ({ rx: 1000, tx: 500 }) });
  for (let i = 0; i < WINDOW + 5; i++) await m.tick();
  assert.strictEqual(last.samples.length, WINDOW);
  assert.strictEqual(last.ping.loss, 0); // Cloudflare giù ma Google risponde: non è perdita
  assert.strictEqual(last.target, 'Google');
  assert.deepStrictEqual(last.rates, { rx: 1000, tx: 500 });
  assert.ok(seen.includes('8.8.8.8'));
});

test('offline: tutti i campioni persi, nessun valore inventato', async () => {
  let last = null;
  const m = new NetMonitor({ probe: async () => null, onTick: (n) => { last = n; } });
  await m.tick(); await m.tick();
  assert.strictEqual(last.ping.loss, 100);
  assert.strictEqual(last.ping.avg, null);
  assert.strictEqual(last.ping.current, null);
});

test('tcpPing misura una connessione vera e dà null se non risponde', async () => {
  const srv = net.createServer((s) => s.end()).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const ms = await tcpPing('127.0.0.1', srv.address().port, 1000);
  srv.close();
  assert.ok(typeof ms === 'number' && ms >= 0 && ms < 1000);
  assert.strictEqual(await tcpPing('127.0.0.1', 1, 500), null); // porta chiusa
});

test('la pagina ha il riquadro Connessione Internet', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '../src/renderer/index.html'), 'utf8');
  for (const id of ['in-ping', 'in-rx', 'in-tx', 'in-speed', 'in-loss', 'sp-ping', 'sp-inet']) assert.match(html, new RegExp(`id="${id}"`));
});
