'use strict';
// Periferica senza driver.
//
// Su questo PC nessuna periferica ha un protocollo verificato per il modello esatto (vedi CLAUDE.md):
//   - tastiera + mouse sul ricevitore 2.4 GHz 1d57:fa60 (chip Xenta generico, marca non riconoscibile);
//   - mouse Bluetooth "X11mouse" (BLE): la batteria la legge già Windows, Unico la mostra fra le batterie Bluetooth;
//   - cuffie Logitech G435 collegate in Bluetooth: Logitech non espone niente in Bluetooth e HeadsetControl
//     non le supporta (issue Sapd/HeadsetControl#336); la batteria arriva, se c'è, da Windows;
//   - EarPods USB-C (05ac:110b): cuffie a filo, niente batteria né impostazioni.
// Quindi questo "driver" non apre mai un dispositivo HID e non manda niente: dice solo "non trovato".
// Così la regola di CLAUDE.md è rispettata alla lettera: niente comandi indovinati.

const NOT_SUPPORTED = 'Periferica non supportata su questo PC';

class NoDevice {
  constructor(name) {
    this.name = name;
    this.ledTimer = null;
  }

  async status() { return { connected: false, name: this.name }; }
  async battery() { return { connected: false, name: this.name }; }

  // mouse
  async apply() { return { ok: false, error: NOT_SUPPORTED }; }
  async currentDpi() { return null; }

  // cuffie
  async setBlocked() {}
  async ensureHardwareMode() {}
  async setSleep() { return { ok: false, error: NOT_SUPPORTED }; }
  async startLighting() { return { ok: false, error: NOT_SUPPORTED }; }
  updateLighting() {}
  async stopLighting() { return { ok: true }; }

  // tastiera
  async applyLighting() { return { ok: false, error: NOT_SUPPORTED }; }
  async applySettings() { return { ok: false, error: NOT_SUPPORTED }; }
  async uploadScreen() { return { ok: false, error: NOT_SUPPORTED }; }
  async syncClock() { return { ok: false, error: NOT_SUPPORTED }; }
}

// Valori che la pagina della tastiera si aspetta (pagina nascosta): liste vuote.
const MODES = [];
const SLEEP = {};

module.exports = { NoDevice, MODES, SLEEP, NOT_SUPPORTED };
