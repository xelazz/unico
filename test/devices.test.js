'use strict';
// Su questo PC nessuna periferica ha un driver: Unico deve dire "non trovato" e non aprire mai niente.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { NoDevice } = require('../src/devices/none');
const { createFakeHid } = require('./fake-hid');

test('periferiche senza driver: non trovate, mai una batteria inventata', async () => {
  for (const name of ['Mouse', 'Cuffie', 'Tastiera']) {
    const d = new NoDevice(name);
    const s = await d.status();
    assert.strictEqual(s.connected, false);
    assert.strictEqual(s.battery, undefined);
    assert.strictEqual((await d.battery()).battery, undefined);
    assert.strictEqual((await d.apply({ dpi: 800 })).ok, false);
    assert.strictEqual(d.ledTimer, null);
  }
});

test('il simulatore elenca le periferiche di questo PC e rifiuta le aperture', async () => {
  const hid = createFakeHid();
  const ids = new Set((await hid.devicesAsync()).map((d) => `${d.vendorId.toString(16)}:${d.productId.toString(16)}`));
  assert.deepStrictEqual([...ids].sort(), ['1d57:fa60', '5ac:110b']);
  await assert.rejects(hid.HIDAsync.open('rx-kbd'));
});

test('nessun driver manda comandi HID', () => {
  const dir = path.join(__dirname, '../src/devices');
  assert.deepStrictEqual(fs.readdirSync(dir), ['none.js']);
  const src = fs.readFileSync(path.join(dir, 'none.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]node-hid|\.write\(|sendFeatureReport|HIDAsync/);
});

test('pagine di mouse, cuffie e tastiera nascoste', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  for (const p of ['mouse', 'headset', 'keyboard']) assert.match(html, new RegExp(`<button data-page="${p}" hidden`));
  assert.match(html, /lights-card" hidden/);
});

test('aggiornamenti solo dal fork, non dalle release di Hekat', () => {
  const pkg = require('../package.json');
  for (const p of pkg.build.publish) assert.notStrictEqual(String(p.owner).toLowerCase(), 'hekatisback');
});
