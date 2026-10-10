'use strict';

// Anweisung 63, Teil 1: ALTCHA-Challenge/Response, serverseitig auf unserem
// eigenen Server. Kein fremder Dienst, keine Cookies, keine Daten an Dritte.
// Implementiert nach dem ALTCHA-Schema (SHA-256 Proof of Work + HMAC-Signatur)
// mit Node-crypto, damit der Formular-Dienst keine zusaetzliche Abhaengigkeit
// braucht. Das sichtbare Widget im Browser kommt aus dem npm-Paket `altcha`
// (von Astro gebuendelt), nicht von hier.

const crypto = require('crypto');

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function hmacHex(key, s) {
  return crypto.createHmac('sha256', key).update(s, 'utf8').digest('hex');
}

// Eine signierte Aufgabe erzeugen. Ablauf steckt als ?expires=<unixsec> im Salt
// (so wie ALTCHA es erwartet), damit der Server beim Pruefen nichts speichern muss.
function createChallenge(hmacKey, opts) {
  const o = opts || {};
  const maxNumber = o.maxNumber || 1000000; // Bibliotheks-Standard, auf altem Handy in Sekunden loesbar
  const expiresSec = o.expiresSec || 600; // 10 Minuten (Teil 1)
  const expires = Math.floor(Date.now() / 1000) + expiresSec;
  const saltRaw = crypto.randomBytes(12).toString('hex');
  const salt = saltRaw + '?expires=' + expires;
  const secret = crypto.randomInt(0, maxNumber + 1);
  const challenge = sha256hex(salt + secret);
  const signature = hmacHex(hmacKey, challenge);
  return { algorithm: 'SHA-256', challenge, maxnumber: maxNumber, salt, signature };
}

// Eine Loesung pruefen. payloadB64 ist das base64-kodierte JSON aus dem
// versteckten Feld `altcha`. Rueckgabe: { ok, reason, signature?, expires? }.
function verifySolution(payloadB64, hmacKey) {
  let p;
  try {
    p = JSON.parse(Buffer.from(String(payloadB64 || ''), 'base64').toString('utf8'));
  } catch (e) {
    return { ok: false, reason: 'parse' };
  }
  if (!p || p.algorithm !== 'SHA-256' || !p.challenge || !p.salt ||
      typeof p.number === 'undefined' || !p.signature) {
    return { ok: false, reason: 'shape' };
  }
  // Ablauf aus dem Salt
  const m = /[?&]expires=(\d+)/.exec(String(p.salt));
  const expires = m ? parseInt(m[1], 10) : null;
  if (expires && Date.now() / 1000 > expires) {
    return { ok: false, reason: 'expired' };
  }
  // Proof of Work nachrechnen
  const challenge = sha256hex(String(p.salt) + p.number);
  if (challenge !== String(p.challenge)) {
    return { ok: false, reason: 'challenge' };
  }
  // Signatur pruefen (laengensicher + timing-safe)
  const sig = hmacHex(hmacKey, challenge);
  const a = Buffer.from(sig);
  const b = Buffer.from(String(p.signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature' };
  }
  return { ok: true, signature: sig, expires };
}

module.exports = { createChallenge, verifySolution };
