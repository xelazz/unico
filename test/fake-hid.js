'use strict';
// Simulatore HID delle periferiche di questo PC (rilevate con Get-PnpDevice).
// Nessuna ha un driver in Unico: il simulatore le elenca soltanto, così la diagnostica le mostra,
// e rifiuta qualsiasi apertura, così un test si accorge se qualcosa prova a parlarci.
// Usato dai test e da UNICO_MOCK=1 per provare l'interfaccia senza hardware.

function makeWorld() {
  return { opened: [] };
}

const devicesFor = () => [
  // ricevitore 2.4 GHz di tastiera + mouse (chip Xenta generico)
  { vendorId: 0x1d57, productId: 0xfa60, path: 'rx-kbd', usagePage: 0x0001, usage: 0x0006, interface: 0, product: '2.4G Receiver' },
  { vendorId: 0x1d57, productId: 0xfa60, path: 'rx-mouse', usagePage: 0x0001, usage: 0x0002, interface: 1, product: '2.4G Receiver' },
  { vendorId: 0x1d57, productId: 0xfa60, path: 'rx-consumer', usagePage: 0x000c, usage: 0x0001, interface: 2, product: '2.4G Receiver' },
  { vendorId: 0x1d57, productId: 0xfa60, path: 'rx-kbd2', usagePage: 0x0001, usage: 0x0006, interface: 3, product: '2.4G Receiver' },
  // EarPods USB-C (a filo)
  { vendorId: 0x05ac, productId: 0x110b, path: 'earpods-consumer', usagePage: 0x000c, usage: 0x0001, interface: 3, product: 'EarPods' },
  { vendorId: 0x05ac, productId: 0x110b, path: 'earpods-vendor', usagePage: 0xff00, usage: 0x0001, interface: 4, product: 'EarPods' },
];

function createFakeHid(world = makeWorld()) {
  return {
    world,
    devicesAsync: async () => devicesFor(),
    HIDAsync: { open: async (path) => { world.opened.push(path); throw new Error('Nessun driver per questa periferica'); } },
    getHidapiVersion: () => 'fake',
  };
}

module.exports = { createFakeHid, makeWorld, devicesFor };
