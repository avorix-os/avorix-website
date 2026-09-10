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

const { FORMS } = require('./forms');

// ---------------------------------------------------------------------------
// Konfiguration (alles ueber Umgebungsvariablen / .env)
// ---------------------------------------------------------------------------
const CFG = {
  port: parseInt(process.env.PORT || '8081', 10),
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
};

const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

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
function respondOk(req, res, def) {
  if (wantsJson(req)) return sendJson(res, 200, { ok: true });
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

function buildBody(def, kennung, fields, files) {
  const lines = [];
  lines.push(`Formular: ${kennung}`);
  lines.push(`Eingegangen: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`);
  lines.push('');
  for (const fld of def.fields) {
    if (fld.name === CFG.honeypotField) continue;
    const label = LABELS[fld.name] || fld.name;
    let val = fields[fld.name];
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

async function deliver(def, kennung, fields, files) {
  const t = getTransport();
  const to =
    def.toBewerbung && CFG.mail.toBewerbung ? CFG.mail.toBewerbung : CFG.mail.to;
  const replyTo = fields.email && isValidEmail(fields.email) ? fields.email : undefined;

  const mail = {
    from: CFG.mail.from,
    to,
    replyTo, // Antwort geht direkt an den Absender (3.2 Punkt 9)
    subject: def.subject, // vom Dienst gesetzt, nie aus dem Formular (3.2 Punkt 2)
    text: buildBody(def, kennung, fields, files),
  };
  if (files && files.length) {
    mail.attachments = files.map((f) => ({ filename: f.filename, content: f.buffer }));
  }
  await t.sendMail(mail);

  // Eingangsbestaetigung an den Absender (nicht bei Bewerbung; 3.2 Punkt 11).
  if (def.ack && replyTo) {
    try {
      await t.sendMail({
        from: CFG.mail.from,
        to: replyTo,
        subject: def.lang === 'en' ? 'We received your enquiry' : 'Ihre Anfrage bei Avorix',
        text: ackBody(def),
      });
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

  // --- Spamabwehr (freundlich: Bot bekommt "Erfolg", Nachricht wird verworfen) ---
  // Honigtopf (3.2 Punkt 5)
  if (fields[CFG.honeypotField]) {
    log('spam honeypot', kennung);
    return respondOk(req, res, def);
  }
  // Zeitfalle (3.2 Punkt 6): nur pruefen, wenn ts gesetzt ist (Nicht-JS hat keinen).
  const ts = parseInt(fields[CFG.tsField], 10);
  if (!Number.isNaN(ts) && Date.now() - ts < CFG.minFillMs) {
    log('spam timetrap', kennung);
    return respondOk(req, res, def);
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

  // --- Validierung (3.2 Punkt 3 + 4) ---
  for (const fld of def.fields) {
    let v = fields[fld.name];
    if (fld.name === 'newsletter') continue; // Boolean, keine Textpruefung
    if (v === undefined || v === null) v = '';
    v = String(v);
    if (fld.required && v.trim() === '') return respondErr(req, res, 400, `missing_${fld.name}`);
    if (v.length > fld.max) return respondErr(req, res, 400, `too_long_${fld.name}`);
    if (fld.header && hasCRLF(v)) return respondErr(req, res, 400, `invalid_${fld.name}`);
    fields[fld.name] = v;
  }
  if (fields.email && fields.email.trim() !== '' && !isValidEmail(fields.email)) {
    return respondErr(req, res, 400, 'invalid_email');
  }

  // --- Ablegen, dann senden (3.2 Punkt 12) ---
  let base;
  try {
    base = storeRequest(kennung, fields, files);
  } catch (e) {
    errlog('store', e.message);
    return respondErr(req, res, 500, 'store_failed');
  }

  try {
    await deliver(def, kennung, fields, files);
    log('ok', kennung, base);
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
    return respondOk(req, res, def);
  }

  return respondOk(req, res, def);
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
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && u.pathname === '/api/formular/health') {
    return sendJson(res, 200, { ok: true, service: 'avorix-form', forms: Object.keys(FORMS) });
  }
  if (u.pathname !== '/api/formular') return respondErr(req, res, 404, 'not_found');
  if (req.method !== 'POST') return respondErr(req, res, 405, 'method_not_allowed');
  handleForm(req, res).catch((e) => {
    errlog('unhandled', e.stack || e.message);
    respondErr(req, res, 500, 'server_error');
  });
});

server.listen(CFG.port, '127.0.0.1', () => {
  log(`avorix-form hört auf 127.0.0.1:${CFG.port}`);
  if (CFG.allowedOrigins.length === 0) log('WARNUNG: ALLOWED_ORIGINS leer – alle Ursprünge erlaubt (nur DEV!)');
  if (!CFG.mail.host) log('WARNUNG: SMTP_HOST leer – Mailversand wird fehlschlagen (nur DEV!)');
  cleanup();
  setInterval(cleanup, 24 * 60 * 60 * 1000);
});
