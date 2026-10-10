'use strict';

// Avorix-Formular-Dienst (Anweisung 45).
// Nimmt die sieben Website-Formulare (plus Vorsorge fuer Bewerbungen) an,
// prueft, wehrt Spam ab, legt jede Anfrage als Datei ab und stellt sie per
// SMTP an info@avorix.de zu. Formspree faellt damit weg.
//
// Bewusst ohne Web-Framework: Node-http + busboy (Body) + nodemailer (SMTP).
// Ratenbegrenzung und TLS macht nginx davor (3.1). Der Dienst sieht die
// IP-Adresse nie (3.1 / 3.2 Punkt 15).

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');

const { FORMS, ROLLEN, WHATSAPP } = require('./forms');
const altcha = require('./altcha');
const spamfilter = require('./spamfilter');

// ---------------------------------------------------------------------------
// Konfiguration (alles ueber Umgebungsvariablen / .env)
// ---------------------------------------------------------------------------
const CFG = {
  port: parseInt(process.env.PORT || '8081', 10),
  // Im Container 0.0.0.0 (Traefik erreicht den Dienst uebers Docker-Netz).
  // Auf einem klassischen Host mit lokalem nginx besser HOST=127.0.0.1 setzen.
  host: process.env.HOST || '0.0.0.0',
  // Kommagetrennte Liste erlaubter Urspruenge, z. B.
  // "https://avorix.de,https://www.avorix.de". Leer = alles erlauben (nur DEV).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  siteBase: (process.env.SITE_BASE || 'https://avorix.de').replace(/\/+$/, ''),
  dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '90', 10),
  retentionDaysBewerbung: parseInt(process.env.RETENTION_DAYS_BEWERBUNG || '180', 10),
  mail: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'formular@avorix.de',
    to: process.env.MAIL_TO || 'info@avorix.de',
    toBewerbung: process.env.MAIL_TO_BEWERBUNG || '', // leer -> faellt auf `to` zurueck
    failover: process.env.MAIL_FAILOVER || '', // zweite Warn-Adresse bei Sendefehler
  },
  honeypotField: process.env.HONEYPOT_FIELD || 'website',
  tsField: process.env.TS_FIELD || 'form_ts',
  minFillMs: parseInt(process.env.MIN_FILL_MS || '3000', 10),
  // Anweisung 63: ALTCHA-Signierschluessel (zufaellig, >= 32 Zeichen, nur in .env).
  altchaKey: process.env.ALTCHA_HMAC_KEY || '',
  // Ratenfenster (Teil 4 / V5 / Datenschutz: hoechstens 60 Min im Speicher).
  rateWindowMs: 60 * 60 * 1000,
  rateVerdacht: 3, // mehr als 3 je IP oder E-Mail in 60 Min -> Verdacht (V5)
  rateHart: 10,    // mehr als 10 je IP in 60 Min -> harte Sperre 429 (Teil 4)
  // Link-/Inhaltsfilter: Freitext mit echtem Link -> still verwerfen (Bot glaubt
  // an Erfolg). Standard an. LINK_FILTER=false schaltet ihn aus.
  linkFilter: String(process.env.LINK_FILTER || 'true') !== 'false',
  // Strenger Modus: auch nackte Domains ohne Schema (www.foo.de) blocken.
  // Standard aus, weil echte Interessenten mal ihre Adresse nennen koennten.
  linkFilterStrict: String(process.env.LINK_FILTER_STRICT || 'false') === 'true',
  maxTotalUpload: 10 * 1024 * 1024, // 10 MB gesamt (3.3 Punkt 17)
  maxFiles: 3,
};

// Anzeige-Beschriftungen fuer die Mail (Feld -> Klartext). Fallback: Feldname.
const LABELS = {
  name: 'Name',
  email: 'E-Mail',
  telefon: 'Telefon',
  betrieb: 'Betrieb',
  message: 'Nachricht',
  hinweis: 'Hinweis',
  ab_wann: 'Ab wann',
  kuechenteam: 'Küchenteam',
  kuechenproblem: 'Küchenproblem',
  nachricht: 'Nachricht',
  einsatzgebiet: 'Einsatzgebiet',
  source: 'Herkunft',
  newsletter: 'Newsletter-Einwilligung',
  rolle: 'Bewirbt sich als',
  region: 'Region',
  erfahrung: 'Erfahrung',
  quelle: 'Quelle',
  // Anweisung 61 (HU/EN-Bewerberseiten)
  sprache: 'Seitensprache',
  sprachen: 'Sprachen',
  land: 'Land',
};

const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

// ---------------------------------------------------------------------------
// Anweisung 63: Zustand im Arbeitsspeicher. Alles laeuft nach 60 Min ab, damit
// die IP-Adresse hoechstens 60 Minuten gehalten wird (Datenschutz, Teil 5).
// ---------------------------------------------------------------------------
const usedSolutions = new Map(); // ALTCHA-Signatur -> Ablauf (ms), Einmal-Nutzung
const ipHits = new Map();        // IP -> [ts(ms)]
const emailHits = new Map();     // E-Mail (klein) -> [ts(ms)]

function pruneHits(map) {
  const grenze = Date.now() - CFG.rateWindowMs;
  for (const [k, arr] of map) {
    const neu = arr.filter((t) => t > grenze);
    if (neu.length) map.set(k, neu);
    else map.delete(k);
  }
}

// Zaehlt einen Treffer und gibt die Anzahl im Fenster zurueck (inkl. diesem).
function hit(map, key) {
  if (!key) return 0;
  const grenze = Date.now() - CFG.rateWindowMs;
  const arr = (map.get(key) || []).filter((t) => t > grenze);
  arr.push(Date.now());
  map.set(key, arr);
  return arr.length;
}

// Client-IP aus X-Forwarded-For (Traefik setzt den Kopf). Nur fuer Zaehler im
// Speicher, nie gespeichert, nie in Mail/Log.
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  if (xff) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

// Zaehl-Log fuer Sperren und Verdacht: Datum, Uhrzeit, Kennung, Regel. KEINE
// Namen, E-Mail-Adressen oder Texte (Teil 4).
function logSpam(kennung, regel) {
  try {
    const now = new Date();
    const monat = now.toISOString().slice(0, 7);
    const dir = path.join(CFG.dataDir, 'spam-log');
    fs.mkdirSync(dir, { recursive: true });
    const zeile = `${now.toISOString()},${kennung},${regel}\n`;
    fs.appendFileSync(path.join(dir, `${monat}.csv`), zeile);
  } catch (e) { errlog('spam-log', e.message); }
  log('spam', kennung, regel);
}

// Einfache HTML-Fehlerseite fuer Nicht-JS-Absendungen (Teil 1): Meldung + Link
// zurueck, statt rohem JSON.
function sendHtmlError(req, res, code, text) {
  let back = CFG.siteBase + '/';
  if (req.headers.referer) {
    try { const u = new URL(req.headers.referer); back = u.origin + u.pathname; } catch (_) {}
  }
  const body = '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Anfrage nicht gesendet</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#26251f">' +
    '<p>' + text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</p>' +
    '<p><a href="' + back + '">Zurück zum Formular</a></p></body></html>';
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
function errlog(...args) {
  console.error(new Date().toISOString(), 'ERROR', ...args);
}

function originAllowed(req) {
  if (CFG.allowedOrigins.length === 0) return true; // DEV
  let origin = req.headers.origin;
  if (!origin && req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      origin = u.origin;
    } catch (_) {
      origin = undefined;
    }
  }
  return !!origin && CFG.allowedOrigins.includes(origin);
}

function wantsJson(req) {
  const a = String(req.headers.accept || '');
  const x = String(req.headers['x-requested-with'] || '');
  return a.includes('application/json') || x.toLowerCase() === 'xmlhttprequest';
}

function isValidEmail(v) {
  // bewusst simpel, keine RFC-Vollpruefung
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function hasCRLF(v) {
  return /[\r\n]/.test(v);
}

// Link-/Inhaltsfilter (Empfehlung 1 der Spamschutz-Uebergabe 2026-09-14).
// Echte Personal-/Demo-Anfragen enthalten so gut wie nie einen Hyperlink;
// klassischer Formspam dagegen fast immer (Gewinnspiel-Link, URL-Shortener,
// telegra.ph/t.me). Hochpraezise per Default: nur echte Links, Link-Markup und
// reine Spam-Hosts. Nackte Domains (www.foo.de) nur im strengen Modus.
const LINK_RE = /(https?:\/\/|<a\s|\[url\b|\[\/url\]|\]\(\s*https?:|\bt\.me\/|\btelegra\.ph\b)/i;
const BARE_DOMAIN_RE = /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i;

// Gibt den Feldnamen zurueck, in dem ein Link steckt, sonst null.
function linkSpamField(def, fields) {
  for (const fld of def.fields) {
    if (fld.name === CFG.honeypotField || fld.name === 'newsletter') continue;
    const v = fields[fld.name];
    if (typeof v !== 'string' || v === '') continue;
    if (LINK_RE.test(v)) return fld.name;
    if (CFG.linkFilterStrict && BARE_DOMAIN_RE.test(v)) return fld.name;
  }
  return null;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendRedirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

// Antwort je nach Aufrufart: JSON (Hintergrundversand) oder Redirect (Nicht-JS).
// Anweisung 63: `verdacht` haengt das Flag an das JSON, damit das Skript bei
// Verdacht KEIN dataLayer-Ereignis ausloest (sonst zaehlt Google Ads Spam).
function respondOk(req, res, def, verdacht) {
  if (wantsJson(req)) return sendJson(res, 200, verdacht ? { ok: true, verdacht: true } : { ok: true });
  if (def && def.redirect) return sendRedirect(res, CFG.siteBase + def.redirect);
  // Standard: zurueck zur Formularseite mit ?sent=1
  let back = CFG.siteBase + '/';
  if (req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      back = u.origin + u.pathname + '?sent=1';
    } catch (_) {}
  }
  return sendRedirect(res, back);
}

// Anweisung 63, Teil 4: harte Sperre (ALTCHA ungueltig, zu viele Anfragen).
// JSON { ok:false } mit Statuscode; Nicht-JS bekommt eine HTML-Fehlerseite.
function respondBlock(req, res, code) {
  if (wantsJson(req)) return sendJson(res, code, { ok: false });
  return sendHtmlError(req, res, code,
    'Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es gleich noch einmal, Ihre Angaben bleiben erhalten. Oder rufen Sie uns an: 07541 3973915 · info@avorix.de');
}

function respondErr(req, res, code, error) {
  if (wantsJson(req)) return sendJson(res, code, { ok: false, error });
  const msg = encodeURIComponent(error);
  let back = CFG.siteBase + '/';
  if (req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      back = u.origin + u.pathname + '?error=' + msg;
    } catch (_) {}
  }
  return sendRedirect(res, back);
}

function magicOk(buf) {
  for (const sig of Object.values(MAGIC)) {
    if (buf.length >= sig.length && sig.every((b, i) => buf[i] === b)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SMTP
// ---------------------------------------------------------------------------
let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: CFG.mail.host,
    port: CFG.mail.port,
    secure: CFG.mail.secure, // true bei 465, sonst STARTTLS auf 587
    auth: CFG.mail.user ? { user: CFG.mail.user, pass: CFG.mail.pass } : undefined,
  });
  return transporter;
}

function buildBody(def, kennung, fields, files, reasons) {
  const lines = [];
  // Anweisung 63, Teil 3: bei Verdacht sagt die erste Zeile, warum.
  if (reasons && reasons.length) {
    lines.push(`Verdacht, weil: ${reasons.join(', ')}`);
    lines.push('');
  }
  lines.push(`Formular: ${kennung}`);
  lines.push(`Eingegangen: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`);
  lines.push('');
  for (const fld of def.fields) {
    if (fld.name === CFG.honeypotField) continue;
    // Anweisung 61: Sprache/Land/Sprachen nur zeigen, wenn belegt (deutsche
    // /jobs/-Bewerbungen senden sie nicht; die Seitensprache de ist der Normalfall
    // und bleibt aus der Benachrichtigung).
    if (fld.name === 'sprache' && (!fields.sprache || fields.sprache === 'de')) continue;
    if ((fld.name === 'land' || fld.name === 'sprachen') && !fields[fld.name]) continue;
    const label = LABELS[fld.name] || fld.name;
    let val = fields[fld.name];
    if (fld.name === 'rolle' && def.bewerbung) val = ROLLEN[val] || val;
    if (fld.name === 'newsletter') {
      val = fields.newsletter ? 'JA – eingewilligt' : 'nein – nicht eingewilligt';
    }
    lines.push(`${label}: ${val || '—'}`);
  }
  if (files && files.length) {
    lines.push('');
    lines.push(`Anhänge: ${files.length}`);
    for (const f of files) lines.push(`  - ${f.filename} (${f.size} Bytes)`);
  }
  // Anweisung 53 (A7): Klick-Kennung als letzte Zeile, nur wenn vorhanden.
  if (fields.gclid) {
    lines.push(`Google-Ads-Klick: ${fields.gclid}`);
  }
  return lines.join('\n');
}

function ackBody(def) {
  if (def.lang === 'en') {
    return (
      'Thank you for your enquiry. We have received it and will get back to you shortly.\n\n' +
      'If it is urgent, call us on 07541 3973915.\n\n' +
      'Avorix GmbH'
    );
  }
  return (
    'vielen Dank für Ihre Anfrage. Sie ist bei uns eingegangen, wir melden uns in Kürze.\n\n' +
    'Wenn es eilig ist, erreichen Sie uns unter 07541 3973915.\n\n' +
    'Avorix GmbH'
  );
}

// Anweisung 60: Betreff der Bewerbung mit Rolle und Region.
// Anweisung 63: bei Verdacht "[Verdacht] " davor.
function subjectFor(def, fields, verdacht) {
  let s;
  if (def.bewerbung) {
    s = `Bewerbung: ${ROLLEN[fields.rolle] || fields.rolle}, ${fields.region}`;
  } else {
    s = def.subject;
  }
  return verdacht ? `[Verdacht] ${s}` : s;
}

function escHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Anweisung 60: Eingangsbestaetigung der Bewerbung, im Du. Zeigt die Felder
// ohne gclid und ohne quelle. WhatsApp ist in der HTML-Fassung ein Link.
function bewerbungAck(fields) {
  const wa = `https://wa.me/${WHATSAPP}`;
  const zeilen = [
    ['Name', fields.name],
    ['Telefon', fields.telefon],
    ['E-Mail', fields.email],
    ['Ich bewerbe mich als', ROLLEN[fields.rolle] || fields.rolle],
    ['Wo du arbeiten willst', fields.region],
    ['Erfahrung in der Gastronomie', fields.erfahrung],
    ['Was du zuletzt gemacht hast', fields.nachricht],
  ].filter(([, v]) => v && String(v).trim() !== '');
  const text = [
    `Hallo ${fields.name},`,
    '',
    'danke für deine Bewerbung. Sie ist bei uns angekommen, wir melden uns innerhalb von 24 Stunden, meistens telefonisch.',
    '',
    `Wenn du vorher etwas fragen willst: 07541 3973915, Montag bis Freitag von 8 bis 17 Uhr, oder per WhatsApp (${wa}).`,
    '',
    'Viele Grüße',
    'dein Avorix-Team',
    '',
    'Das hast du uns geschickt:',
    ...zeilen.map(([k, v]) => `${k}: ${v}`),
    '',
    'Avorix GmbH',
  ].join('\n');
  const html =
    `<p>Hallo ${escHtml(fields.name)},</p>` +
    '<p>danke für deine Bewerbung. Sie ist bei uns angekommen, wir melden uns innerhalb von 24 Stunden, meistens telefonisch.</p>' +
    `<p>Wenn du vorher etwas fragen willst: 07541 3973915, Montag bis Freitag von 8 bis 17 Uhr, oder per <a href="${wa}">WhatsApp</a>.</p>` +
    '<p>Viele Grüße<br>dein Avorix-Team</p>' +
    '<p><strong>Das hast du uns geschickt:</strong><br>' +
    zeilen.map(([k, v]) => `${escHtml(k)}: ${escHtml(v).replace(/\r?\n/g, '<br>')}`).join('<br>') +
    '</p><p>Avorix GmbH</p>';
  return { subject: 'Deine Bewerbung bei Avorix', text, html };
}

// Anweisung 61, Teil 7: Pflichtangaben nach § 35a GmbHG unter jede
// Eingangsbestaetigung (Geschaeftsbrief). DE fuer deutsche Formulare und
// deutschsprachige Bewerbungen, EN fuer englische Formulare, /en/jobs/cook/ und
// die ungarische Seite (Registerdaten, englisch, das versteht jeder Bewerber).
function pflichtFooter(lang) {
  const zeilenDe = [
    'AVORIX GmbH, Sitz Friedrichshafen · Fallenbrunnen 14 · 88045 Friedrichshafen',
    'Geschäftsführer: Börge Penk · Amtsgericht Ulm, HRB 751118 · USt-IdNr. DE368762673',
    'info@avorix.de · 07541 3973915 · https://avorix.de/datenschutz/',
  ];
  const zeilenEn = [
    'AVORIX GmbH, registered office Friedrichshafen · Fallenbrunnen 14 · 88045 Friedrichshafen, Germany',
    'Managing Director: Börge Penk · Registered at Amtsgericht Ulm, HRB 751118 · VAT ID DE368762673',
    'info@avorix.de · +49 7541 3973915 · https://avorix.de/en/privacy/',
  ];
  const zeilen = lang === 'en' ? zeilenEn : zeilenDe;
  const text = '\n\n' + zeilen.join('\n');
  const html =
    '<hr style="border:none;border-top:1px solid #ddd;margin:16px 0">' +
    '<p style="color:#888;font-size:12px;line-height:1.5;margin:0">' +
    zeilen.map((z) => escHtml(z)).join('<br>') +
    '</p>';
  return { text, html };
}

// WhatsApp-Link mit vorformulierter englischer Nachricht (Anweisung 61, Teil 1).
const WA_BEWERBUNG = `https://wa.me/${WHATSAPP}?text=Hello%20Avorix%2C%20I%20would%20like%20to%20apply%20as%20a%20cook.`;

// Anweisung 61: ungarische Eingangsbestaetigung. Felder uebersetzt, ohne
// gclid/quelle/sprache/land; WhatsApp als Link.
function bewerbungAckHu(fields) {
  const zeilen = [
    ['A neved', fields.name],
    ['Telefonszám', fields.telefon],
    ['E-mail', fields.email],
    ['Hol szeretnél dolgozni?', fields.region],
    ['Mennyi tapasztalatod van a vendéglátásban?', fields.erfahrung],
    ['Milyen nyelven beszélsz?', fields.sprachen],
    ['Milyen pozícióban dolgoztál?', fields.nachricht],
  ].filter(([, v]) => v && String(v).trim() !== '');
  const text = [
    `Szia ${fields.name}!`,
    '',
    'Köszönjük a jelentkezésedet, megérkezett hozzánk. 24 órán belül jelentkezünk, telefonon vagy WhatsAppon, angolul vagy németül.',
    '',
    `Ha addig kérdésed van, írj nekünk WhatsAppon (${WA_BEWERBUNG}).`,
    '',
    'Üdvözlettel,',
    'az Avorix csapata',
    '',
    'Amit elküldtél nekünk:',
    ...zeilen.map(([k, v]) => `${k}: ${v}`),
  ].join('\n');
  const html =
    `<p>Szia ${escHtml(fields.name)}!</p>` +
    '<p>Köszönjük a jelentkezésedet, megérkezett hozzánk. 24 órán belül jelentkezünk, telefonon vagy WhatsAppon, angolul vagy németül.</p>' +
    `<p>Ha addig kérdésed van, írj nekünk <a href="${WA_BEWERBUNG}">WhatsAppon</a>.</p>` +
    '<p>Üdvözlettel,<br>az Avorix csapata</p>' +
    '<p><strong>Amit elküldtél nekünk:</strong><br>' +
    zeilen.map(([k, v]) => `${escHtml(k)}: ${escHtml(v).replace(/\r?\n/g, '<br>')}`).join('<br>') +
    '</p>';
  return { subject: 'Jelentkezésed az Avorixnál', text, html };
}

// Anweisung 61: englische Eingangsbestaetigung.
function bewerbungAckEn(fields) {
  const zeilen = [
    ['Your name', fields.name],
    ['Phone number', fields.telefon],
    ['Email', fields.email],
    ['Where do you live?', fields.land],
    ['Where would you like to work?', fields.region],
    ['How long have you worked in hospitality?', fields.erfahrung],
    ['Which languages can you work in?', fields.sprachen],
    ['What did you do most recently?', fields.nachricht],
  ].filter(([, v]) => v && String(v).trim() !== '');
  const text = [
    `Hello ${fields.name},`,
    '',
    'thank you for your application, it has reached us. We will get back to you within 24 hours, by phone or WhatsApp, in English or German.',
    '',
    `If you have a question before then, write to us on WhatsApp (${WA_BEWERBUNG}).`,
    '',
    'Kind regards,',
    'the Avorix team',
    '',
    'What you sent us:',
    ...zeilen.map(([k, v]) => `${k}: ${v}`),
  ].join('\n');
  const html =
    `<p>Hello ${escHtml(fields.name)},</p>` +
    '<p>thank you for your application, it has reached us. We will get back to you within 24 hours, by phone or WhatsApp, in English or German.</p>' +
    `<p>If you have a question before then, write to us on <a href="${WA_BEWERBUNG}">WhatsApp</a>.</p>` +
    '<p>Kind regards,<br>the Avorix team</p>' +
    '<p><strong>What you sent us:</strong><br>' +
    zeilen.map(([k, v]) => `${escHtml(k)}: ${escHtml(v).replace(/\r?\n/g, '<br>')}`).join('<br>') +
    '</p>';
  return { subject: 'Your application at Avorix', text, html };
}

async function deliver(def, kennung, fields, files, verdacht, reasons) {
  const t = getTransport();
  const to =
    def.toBewerbung && CFG.mail.toBewerbung ? CFG.mail.toBewerbung : CFG.mail.to;
  const replyTo = fields.email && isValidEmail(fields.email) ? fields.email : undefined;

  const mail = {
    from: CFG.mail.from,
    to,
    replyTo, // Antwort geht direkt an den Absender (3.2 Punkt 9)
    subject: subjectFor(def, fields, verdacht), // vom Dienst gesetzt, nie frei aus dem Formular (3.2 Punkt 2)
    text: buildBody(def, kennung, fields, files, reasons),
  };
  if (files && files.length) {
    mail.attachments = files.map((f) => ({ filename: f.filename, content: f.buffer }));
  }
  await t.sendMail(mail);

  // Anweisung 63, Teil 3: bei Verdacht KEINE Eingangsbestaetigung an den Absender
  // (sonst Spam-Schleuder an Dritte).
  if (verdacht) return;

  // Eingangsbestaetigung an den Absender (3.2 Punkt 11), nur mit E-Mail.
  if (def.ack && replyTo) {
    try {
      let ack;
      if (def.bewerbung) {
        ack = fields.sprache === 'hu' ? bewerbungAckHu(fields)
            : fields.sprache === 'en' ? bewerbungAckEn(fields)
            : bewerbungAck(fields);
      } else {
        ack = {
          subject: def.lang === 'en' ? 'We received your enquiry' : 'Ihre Anfrage bei Avorix',
          text: ackBody(def),
        };
      }
      // Anweisung 61, Teil 7: Pflichtangaben unter jede Eingangsbestaetigung.
      const footLang = def.bewerbung
        ? (fields.sprache && fields.sprache !== 'de' ? 'en' : 'de')
        : (def.lang === 'en' ? 'en' : 'de');
      const foot = pflichtFooter(footLang);
      ack.text = (ack.text || '') + foot.text;
      if (ack.html) ack.html = ack.html + foot.html;
      await t.sendMail({ from: CFG.mail.from, to: replyTo, ...ack });
    } catch (e) {
      errlog('Eingangsbestaetigung fehlgeschlagen', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Ablage (erst speichern, dann senden; 3.2 Punkt 12)
// ---------------------------------------------------------------------------
function storeRequest(kennung, fields, files) {
  const dir = path.join(CFG.dataDir, kennung);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(4).toString('hex');
  const base = `${stamp}-${rand}`;
  const record = {
    kennung,
    received: new Date().toISOString(),
    fields: { ...fields },
    attachments: (files || []).map((f) => ({ filename: f.filename, size: f.size })),
  };
  delete record.fields[CFG.honeypotField];
  fs.writeFileSync(path.join(dir, base + '.json'), JSON.stringify(record, null, 2));
  // Anhaenge separat neben der JSON ablegen
  for (let i = 0; i < (files || []).length; i++) {
    fs.writeFileSync(path.join(dir, `${base}-anhang-${i + 1}-${files[i].filename}`), files[i].buffer);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Body parsen (busboy: multipart/form-data UND urlencoded)
// ---------------------------------------------------------------------------
function parseBody(req, allowFiles) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: {
          fields: 40,
          fieldSize: 20000, // > groesstes Freitextlimit (5000) mit Puffer
          files: allowFiles ? CFG.maxFiles : 0,
          fileSize: CFG.maxTotalUpload,
        },
      });
    } catch (e) {
      return reject(Object.assign(new Error('bad_content_type'), { code: 400 }));
    }

    const fields = {};
    const files = [];
    let totalBytes = 0;
    let tooBig = false;
    let tooMany = false;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      if (!allowFiles) {
        stream.resume();
        return;
      }
      if (files.length >= CFG.maxFiles) {
        tooMany = true;
        stream.resume();
        return;
      }
      const chunks = [];
      let size = 0;
      stream.on('data', (d) => {
        size += d.length;
        totalBytes += d.length;
        if (totalBytes > CFG.maxTotalUpload) tooBig = true;
        chunks.push(d);
      });
      stream.on('limit', () => {
        tooBig = true;
      });
      stream.on('close', () => {
        files.push({ filename: path.basename(info.filename || 'datei'), size, buffer: Buffer.concat(chunks) });
      });
    });

    bb.on('close', () => {
      if (tooBig) return reject(Object.assign(new Error('upload_too_large'), { code: 400 }));
      if (tooMany) return reject(Object.assign(new Error('too_many_files'), { code: 400 }));
      resolve({ fields, files });
    });
    bb.on('error', (e) => reject(Object.assign(new Error('parse_error'), { code: 400, cause: e })));

    req.pipe(bb);
  });
}

// ---------------------------------------------------------------------------
// Request-Verarbeitung
// ---------------------------------------------------------------------------
async function handleForm(req, res) {
  if (!originAllowed(req)) return respondErr(req, res, 403, 'origin_not_allowed');

  // Kennung brauchen wir vor dem Parsen nicht; wir parsen erst, dann pruefen.
  let parsed;
  try {
    // Wir erlauben Dateien nur, wenn es die Kennung spaeter zulaesst. Da wir die
    // Kennung erst nach dem Parsen kennen, parsen wir grosszuegig und verwerfen
    // Dateien bei Formularen ohne Anhang-Erlaubnis.
    parsed = await parseBody(req, true);
  } catch (e) {
    errlog('parse', e.message);
    return respondErr(req, res, e.code || 400, e.message);
  }

  const { fields } = parsed;
  let { files } = parsed;
  const kennung = String(fields.formular || '').trim();
  const def = FORMS[kennung];
  if (!def) return respondErr(req, res, 400, 'unknown_form');

  // --- Anweisung 63, Teil 1: ALTCHA zuerst, vor allem anderen ---
  if (CFG.altchaKey) {
    const v = altcha.verifySolution(fields.altcha, CFG.altchaKey);
    if (!v.ok) { logSpam(kennung, 'ALTCHA ' + v.reason); return respondBlock(req, res, 400); }
    // Jede Loesung gilt nur einmal (Teil 1).
    if (usedSolutions.has(v.signature)) { logSpam(kennung, 'ALTCHA benutzt'); return respondBlock(req, res, 400); }
    usedSolutions.set(v.signature, v.expires ? v.expires * 1000 : Date.now() + CFG.rateWindowMs);
  }

  // --- Ratenbegrenzung je IP (Teil 4: mehr als 10 in 60 Min -> harte Sperre) ---
  const ip = clientIp(req);
  const ipCount = hit(ipHits, ip);
  if (ipCount > CFG.rateHart) { logSpam(kennung, 'Rate >10/IP'); return respondBlock(req, res, 429); }

  // --- Stille Ablehnungen: Erfolg fuer den Absender, aber verdacht:true (damit
  //     Google Ads keinen Spam als Conversion zaehlt) und KEINE Mail (Teil 4) ---
  // Honigtopf (3.2 Punkt 5)
  if (fields[CFG.honeypotField]) {
    logSpam(kennung, 'Honigtopf');
    return respondOk(req, res, def, true);
  }
  // Zeitfalle (3.2 Punkt 6): nur pruefen, wenn ts gesetzt ist (Nicht-JS hat keinen).
  const ts = parseInt(fields[CFG.tsField], 10);
  if (!Number.isNaN(ts) && Date.now() - ts < CFG.minFillMs) {
    logSpam(kennung, 'Zeitfalle');
    return respondOk(req, res, def, true);
  }

  // Dateien nur behalten, wenn die Kennung sie zulaesst
  if (!def.attachments) files = [];
  if (files.length) {
    for (const f of files) {
      if (!magicOk(f.buffer)) return respondErr(req, res, 400, 'file_type_not_allowed');
    }
  }

  // newsletter-Checkbox auf Boolean normalisieren (an -> true)
  if (Object.prototype.hasOwnProperty.call(def.fields.reduce((a, x) => ((a[x.name] = 1), a), {}), 'newsletter')) {
    const nv = String(fields.newsletter || '').toLowerCase();
    fields.newsletter = ['on', 'true', '1', 'ja', 'yes'].includes(nv);
  }

  // Anweisung 61: Seitensprache und Land ableiten/setzen VOR der Validierung,
  // damit die gesetzten Werte gegen die Options-Listen geprueft werden.
  if (def.bewerbung) {
    if (fields.quelle === 'lp-hu') fields.sprache = 'hu';
    else if (fields.quelle === 'lp-en') fields.sprache = 'en';
    else if (!fields.sprache) fields.sprache = 'de';
    // Die ungarische Seite hat kein Land-Feld.
    if (fields.sprache === 'hu' && !String(fields.land || '').trim()) {
      fields.land = 'Ungarn (ungarische Seite)';
    }
    // Pflicht je nach Seitensprache: Sprachen auf HU und EN, Land nur auf EN.
    if ((fields.sprache === 'hu' || fields.sprache === 'en') && !String(fields.sprachen || '').trim()) {
      return respondErr(req, res, 400, 'missing_sprachen');
    }
    if (fields.sprache === 'en' && !String(fields.land || '').trim()) {
      return respondErr(req, res, 400, 'missing_land');
    }
  }

  // --- Validierung (3.2 Punkt 3 + 4) ---
  for (const fld of def.fields) {
    let v = fields[fld.name];
    if (fld.name === 'newsletter') continue; // Boolean, keine Textpruefung
    if (v === undefined || v === null) v = '';
    v = String(v);
    if (fld.required && v.trim() === '') return respondErr(req, res, 400, `missing_${fld.name}`);
    if (v.length > fld.max) return respondErr(req, res, 400, `too_long_${fld.name}`);
    if (fld.header && hasCRLF(v)) return respondErr(req, res, 400, `invalid_${fld.name}`);
    // Anweisung 60: Auswahlfelder nur mit festen Werten.
    if (fld.options && v !== '' && !fld.options.includes(v)) return respondErr(req, res, 400, `invalid_${fld.name}`);
    fields[fld.name] = v;
  }
  if (fields.email && fields.email.trim() !== '' && !isValidEmail(fields.email)) {
    return respondErr(req, res, 400, 'invalid_email');
  }

  // Anweisung 53 (A7): Google-Ads-Klick-Kennung. Optionales Feld, hoechstens 200
  // Zeichen, nur Buchstaben, Ziffern, Unter- und Bindestrich. Alles andere still
  // verwerfen (kein Fehler). Reist mit der Anfrage mit (keine eigene Speicherung),
  // erscheint in der Benachrichtigung als letzte Zeile, nie in der Bestaetigung.
  {
    const raw = String(fields.gclid || '').trim();
    if (/^[A-Za-z0-9_-]{1,200}$/.test(raw)) {
      fields.gclid = raw;
    } else {
      delete fields.gclid;
    }
  }

  // --- Anweisung 63, Teil 2+4: Verdachtsfilter (nach ALTCHA und Validierung) ---
  // "Nur Links" in allen Freitextfeldern -> stille Ablehnung (keine Mail),
  // Erfolgsmeldung fuer den Absender, verdacht:true.
  if (spamfilter.nurLinks(def, fields)) {
    logSpam(kennung, 'nur Links');
    return respondOk(req, res, def, true);
  }
  const reasons = spamfilter.regelnFelder(kennung, def, fields);
  // V5: Haeufung je IP oder E-Mail in 60 Min (nicht fuer Download-Formulare).
  if (!spamfilter.DOWNLOAD_FORMULARE.includes(kennung)) {
    const em = String(fields.email || '').toLowerCase().trim();
    const emailCount = em ? hit(emailHits, em) : 0;
    if (ipCount > CFG.rateVerdacht || emailCount > CFG.rateVerdacht) reasons.push('V5 Häufung');
  }
  const verdacht = reasons.length > 0;
  if (verdacht) reasons.forEach((r) => logSpam(kennung, r));

  // --- Ablegen, dann senden (3.2 Punkt 12) ---
  let base;
  try {
    base = storeRequest(kennung, fields, files);
  } catch (e) {
    errlog('store', e.message);
    return respondErr(req, res, 500, 'store_failed');
  }

  try {
    await deliver(def, kennung, fields, files, verdacht, reasons);
    log('ok', kennung, base, verdacht ? '(Verdacht)' : '');
  } catch (e) {
    // Anfrage ist gespeichert -> nicht verloren. Fehler muss auffallen (3.2 Punkt 13).
    errlog('mail send failed', kennung, base, e.message);
    if (CFG.mail.failover) {
      try {
        await getTransport().sendMail({
          from: CFG.mail.from,
          to: CFG.mail.failover,
          subject: `[Avorix Formular] Zustellfehler ${kennung}`,
          text: `Mailversand fehlgeschlagen fuer ${kennung} (${base}).\nAnfrage liegt als Datei vor.\nFehler: ${e.message}`,
        });
      } catch (e2) {
        errlog('failover notify failed', e2.message);
      }
    }
    // Fuer den Nutzer trotzdem Erfolg: seine Anfrage ist sicher abgelegt.
    return respondOk(req, res, def, verdacht);
  }

  return respondOk(req, res, def, verdacht);
}

// ---------------------------------------------------------------------------
// Aufraeumen (3.2 Punkt 16): taeglich, mtime-basiert
// ---------------------------------------------------------------------------
function cleanup() {
  try {
    if (!fs.existsSync(CFG.dataDir)) return;
    const now = Date.now();
    for (const kennung of fs.readdirSync(CFG.dataDir)) {
      const dir = path.join(CFG.dataDir, kennung);
      if (!fs.statSync(dir).isDirectory()) continue;
      const days = kennung === 'bewerbung' ? CFG.retentionDaysBewerbung : CFG.retentionDays;
      const maxAge = days * 24 * 60 * 60 * 1000;
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        try {
          if (now - fs.statSync(p).mtimeMs > maxAge) {
            fs.unlinkSync(p);
            log('cleanup removed', path.join(kennung, name));
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    errlog('cleanup', e.message);
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
// Anweisung 63, Teil 1: alte Aufgaben/Zaehler aus dem Speicher werfen. Haeufig,
// damit die IP hoechstens 60 Min gehalten wird (Teil 5).
function pruneState() {
  const now = Date.now();
  for (const [sig, exp] of usedSolutions) if (exp < now) usedSolutions.delete(sig);
  pruneHits(ipHits);
  pruneHits(emailHits);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && u.pathname === '/api/formular/health') {
    return sendJson(res, 200, { ok: true, service: 'avorix-form', forms: Object.keys(FORMS), altcha: !!CFG.altchaKey });
  }
  // Anweisung 63: signierte ALTCHA-Aufgabe ausgeben.
  if (req.method === 'GET' && u.pathname === '/api/altcha/challenge') {
    if (!CFG.altchaKey) return sendJson(res, 503, { error: 'altcha_not_configured' });
    const ch = altcha.createChallenge(CFG.altchaKey);
    const body = JSON.stringify(ch);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    return res.end(body);
  }
  if (u.pathname !== '/api/formular') return respondErr(req, res, 404, 'not_found');
  if (req.method !== 'POST') return respondErr(req, res, 405, 'method_not_allowed');
  handleForm(req, res).catch((e) => {
    errlog('unhandled', e.stack || e.message);
    respondErr(req, res, 500, 'server_error');
  });
});

server.listen(CFG.port, CFG.host, () => {
  log(`avorix-form hört auf ${CFG.host}:${CFG.port}`);
  if (CFG.allowedOrigins.length === 0) log('WARNUNG: ALLOWED_ORIGINS leer – alle Ursprünge erlaubt (nur DEV!)');
  if (!CFG.mail.host) log('WARNUNG: SMTP_HOST leer – Mailversand wird fehlschlagen (nur DEV!)');
  if (!CFG.altchaKey) log('WARNUNG: ALTCHA_HMAC_KEY leer – ALTCHA-Prüfung ist AUS (nur DEV!)');
  cleanup();
  setInterval(cleanup, 24 * 60 * 60 * 1000);
  pruneState();
  setInterval(pruneState, 5 * 60 * 1000);
});
