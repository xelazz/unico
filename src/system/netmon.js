'use strict';
// Connessione Internet: ping e latenza, perdita di pacchetti, velocità del collegamento e test di velocità.
//
// Ping: ogni secondo si apre una connessione TCP verso un server pubblico (porta 443) e si misura quanto
// ci mette a rispondere. È il tempo di andata e ritorno, come il ping classico, ma non dipende dalla
// lingua di Windows (l'uscita di ping.exe cambia da "durata=" a "time=") e non avvia un programma al secondo.
// Una risposta che non arriva entro 1 secondo conta come pacchetto perso.
//
// Download/upload in tempo reale: arrivano dal monitor di sistema (contatori di Windows, tutte le schede).
// Il test di velocità scarica e carica dati da speed.cloudflare.com per pochi secondi, solo quando lo chiedi.
const net = require('net');
const https = require('https');
const crypto = require('crypto');

const TARGETS = [{ host: '1.1.1.1', port: 443, name: 'Cloudflare' }, { host: '8.8.8.8', port: 443, name: 'Google' }];
const WINDOW = 60; // campioni tenuti: un minuto
const TIMEOUT = 1000;

// tempo di connessione TCP in ms, oppure null se non risponde entro il limite
function tcpPing(host, port = 443, timeout = TIMEOUT) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const sock = new net.Socket();
    let done = false;
    const end = (v) => { if (done) return; done = true; sock.destroy(); resolve(v); };
    sock.setTimeout(timeout);
    sock.once('connect', () => end(Number(process.hrtime.bigint() - start) / 1e6));
    sock.once('timeout', () => end(null));
    sock.once('error', () => end(null));
    sock.connect(port, host);
  });
}

// riassunto di una finestra di campioni (null = perso)
function summarize(samples) {
  const ok = samples.filter((x) => x != null);
  if (!samples.length) return { current: null, avg: null, min: null, max: null, jitter: null, loss: null, count: 0 };
  let jit = 0;
  for (let i = 1; i < ok.length; i++) jit += Math.abs(ok[i] - ok[i - 1]);
  const r = (v) => (v == null ? null : Math.round(v));
  return {
    current: r(samples[samples.length - 1]),
    avg: ok.length ? r(ok.reduce((a, b) => a + b, 0) / ok.length) : null,
    min: ok.length ? r(Math.min(...ok)) : null,
    max: ok.length ? r(Math.max(...ok)) : null,
    jitter: ok.length > 1 ? r(jit / (ok.length - 1)) : null,
    loss: Math.round((100 * (samples.length - ok.length)) / samples.length),
    count: samples.length,
  };
}

// giudizio semplice per la latenza e la perdita
function verdict(s) {
  if (!s || !s.count) return { level: 'wait', text: 'Misurazione in corso…' };
  if (s.avg == null) return { level: 'bad', text: 'Nessuna risposta: sei offline o la rete blocca le connessioni.' };
  if (s.loss >= 5) return { level: 'bad', text: `Si perdono pacchetti (${s.loss}%): la connessione è instabile.` };
  if (s.avg > 100 || (s.jitter != null && s.jitter > 30)) return { level: 'mid', text: 'Connessione lenta o con sbalzi: si nota nei giochi online e nelle chiamate.' };
  if (s.loss > 0) return { level: 'mid', text: `Qualche pacchetto perso (${s.loss}%), per il resto va bene.` };
  return { level: 'good', text: 'Connessione stabile: latenza bassa e nessun pacchetto perso.' };
}

// da netsh wlan show interfaces: nome della rete e segnale (in italiano e in inglese)
function parseWlan(raw) {
  const t = String(raw || '');
  const ssid = (t.match(/^\s*SSID\s*:\s*(.+?)\s*$/m) || [])[1] || null;
  const sig = t.match(/^\s*(?:Segnale|Signal)\s*:\s*(\d+)\s*%/im);
  return { ssid, signal: sig ? +sig[1] : null };
}

class NetMonitor {
  constructor({ probe = tcpPing, linkInfo = async () => null, rates = () => null, onTick = () => {}, log = () => {} } = {}) {
    this.probe = probe;
    this.linkInfo = linkInfo;
    this.rates = rates;
    this.onTick = onTick;
    this.log = log;
    this.samples = [];
    this.timer = null;
    this.link = null;
    this.linkAt = 0;
    this.target = TARGETS[0];
    this.speed = null;
  }

  want(on) {
    if (on && !this.timer) { this.timer = setInterval(() => this.tick(), 1000); this.tick(); }
    if (!on && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      let ms = await this.probe(this.target.host, this.target.port);
      if (ms == null) {
        // il server di riserva distingue "Cloudflare non risponde" da "sei offline"
        const other = TARGETS.find((t) => t !== this.target);
        const ms2 = await this.probe(other.host, other.port);
        if (ms2 != null) { this.target = other; ms = ms2; }
      }
      this.samples.push(ms);
      if (this.samples.length > WINDOW) this.samples.shift();
      if (Date.now() - this.linkAt > 10000) {
        this.linkAt = Date.now();
        this.linkInfo().then((l) => { this.link = l; }).catch((e) => this.log(`rete: ${e.message}`));
      }
      this.onTick(this.snapshot());
    } finally { this.busy = false; }
  }

  snapshot() {
    const s = summarize(this.samples);
    return { at: Date.now(), ping: s, samples: this.samples.slice(), verdict: verdict(s), target: this.target.name, rates: this.rates(), link: this.link, speed: this.speed };
  }
}

// --------------------------------------------------------------------------- test di velocità
const SPEED_HOST = 'speed.cloudflare.com';

function downloadFor(ms, streams = 4, onBytes = () => {}, server = { host: SPEED_HOST }) {
  return new Promise((resolve) => {
    let bytes = 0, open = 0, finished = false;
    const start = Date.now();
    const reqs = [];
    const finish = () => {
      if (finished) return; finished = true;
      reqs.forEach((r) => r.destroy());
      const secs = (Date.now() - start) / 1000;
      resolve(bytes && secs ? (bytes * 8) / secs / 1e6 : null);
    };
    const one = () => {
      if (finished) return;
      open++;
      const req = https.get({ ...server, path: '/__down?bytes=100000000', timeout: ms + 2000 }, (res) => {
        res.on('data', (c) => { bytes += c.length; onBytes(bytes); });
        res.on('end', () => { open--; one(); });
        res.on('error', () => { open--; });
      });
      req.on('error', () => { open--; if (!open && !bytes) finish(); });
      req.on('timeout', () => req.destroy());
      reqs.push(req);
    };
    for (let i = 0; i < streams; i++) one();
    setTimeout(finish, ms);
  });
}

function uploadFor(ms, streams = 3, server = { host: SPEED_HOST }) {
  return new Promise((resolve) => {
    let bytes = 0, finished = false;
    const start = Date.now();
    const chunk = crypto.randomBytes(256 * 1024);
    const reqs = [];
    const finish = () => {
      if (finished) return; finished = true;
      reqs.forEach((r) => r.destroy());
      const secs = (Date.now() - start) / 1000;
      resolve(bytes && secs ? (bytes * 8) / secs / 1e6 : null);
    };
    const one = () => {
      if (finished) return;
      const req = https.request({ ...server, path: '/__up', method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, timeout: ms + 2000 }, (res) => { res.resume(); res.on('end', one); });
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
      reqs.push(req);
      // si scrive a pezzi finché il tempo non scade, poi la richiesta si chiude
      const pump = () => {
        while (!finished && req.write(chunk)) bytes += chunk.length;
        if (finished) return;
        bytes += chunk.length;
      };
      req.on('drain', pump);
      pump();
    };
    for (let i = 0; i < streams; i++) one();
    setTimeout(finish, ms);
  });
}

async function speedTest({ seconds = 8, onPhase = () => {} } = {}) {
  onPhase('ping');
  const pings = [];
  for (let i = 0; i < 5; i++) pings.push(await tcpPing(SPEED_HOST, 443, 2000));
  const ok = pings.filter((x) => x != null);
  if (!ok.length) return { ok: false, error: 'Il server del test non risponde: controlla di essere connesso a Internet.' };
  onPhase('download');
  const down = await downloadFor(seconds * 1000);
  onPhase('upload');
  const up = await uploadFor(Math.round(seconds * 0.75) * 1000);
  return { ok: true, at: Date.now(), ping: Math.round(Math.min(...ok)), down: down == null ? null : Math.round(down * 10) / 10, up: up == null ? null : Math.round(up * 10) / 10, server: SPEED_HOST };
}

module.exports = { NetMonitor, tcpPing, summarize, verdict, parseWlan, speedTest, downloadFor, uploadFor, TARGETS, WINDOW };
