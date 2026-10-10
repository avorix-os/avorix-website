'use strict';

// Anweisung 63, Teil 2: Verdachtsfilter nach Inhalt. Laeuft NACH der ALTCHA-
// Pruefung. Trifft eine Regel zu, ist die Anfrage verdaechtig (nicht geloescht:
// Benachrichtigung geht mit [Verdacht] raus). V5 (IP/E-Mail-Haeufung) wird in
// server.js ergaenzt, weil es Zaehlerstand braucht.

const DISPOSABLE = require('./disposable-domains');

// Freitextfelder (Teil 2).
const FREITEXT = ['hinweis', 'message', 'nachricht', 'kuechenproblem', 'kuechenteam'];

// V4 gilt nur fuer die deutschen Kundenformulare (nicht Bewerbung, nicht en-*).
const DEUTSCHE_KUNDENFORMULARE = ['personal', 'kontakt', 'pilot', 'leitfaden', 'vorlage-inventur', 'vorlage-kalkulation'];

// Download-Formulare zaehlen bei V5 nicht mit (Teil 2 V5).
const DOWNLOAD_FORMULARE = ['leitfaden', 'vorlage-inventur', 'vorlage-kalkulation'];

// V2-Wortliste. HIER an EINER Stelle pflegen (Teil 2). Klein geschrieben,
// Vergleich als Wortteil, Gross/Klein egal.
const SPAM_WOERTER = [
  'seo', 'backlink', 'linkbuilding', 'ranking', 'suchmaschinenoptimierung',
  'gastbeitrag', 'guest post', 'sponsored', 'crypto', 'krypto', 'bitcoin',
  'forex', 'loan', 'lead generation', 'web design', 'webdesign',
  'app development', 'outsourcing team', 'unsubscribe', 'whatsapp me',
];

// V1: echter Link (http://, https:// oder www.). Eine blosse Domain oder eine
// E-Mail-Adresse ohne diese Vorsilben zaehlt NICHT.
const LINK_RE = /(https?:\/\/|\bwww\.)/i;

// V4: kyrillisch, chinesisch, japanisch, koreanisch, arabisch.
const FREMDE_SCHRIFT_RE = /[Ѐ-ԯ]|[一-鿿㐀-䶿]|[぀-ヿ]|[가-힯ᄀ-ᇿ]|[؀-ۿݐ-ݿ]/;

function freitextWerte(def, fields) {
  return def.fields
    .filter((f) => FREITEXT.includes(f.name))
    .map((f) => String(fields[f.name] || ''))
    .filter((v) => v.trim() !== '');
}

// Reine Feld-/Inhaltsregeln (V1, V2, V3, V4, V6). Rueckgabe: Array von Gruenden.
function regelnFelder(kennung, def, fields) {
  const reasons = [];
  const texts = freitextWerte(def, fields);

  // V1
  if (texts.some((t) => LINK_RE.test(t))) reasons.push('V1 Link im Text');

  // V2 (Freitext + betrieb, nicht name/email)
  const heuhaufen = texts.concat([String(fields.betrieb || '')]).join(' \n ').toLowerCase();
  const treffer = SPAM_WOERTER.find((w) => heuhaufen.includes(w));
  if (treffer) reasons.push('V2 Wort „' + treffer + '“');

  // V3
  const email = String(fields.email || '').toLowerCase().trim();
  const at = email.lastIndexOf('@');
  if (at >= 0) {
    const dom = email.slice(at + 1);
    if (DISPOSABLE.has(dom)) reasons.push('V3 Wegwerf-Adresse');
  }

  // V4 (nur deutsche Kundenformulare)
  if (DEUTSCHE_KUNDENFORMULARE.includes(kennung)) {
    if (FREMDE_SCHRIFT_RE.test(String(fields.name || '')) || FREMDE_SCHRIFT_RE.test(String(fields.betrieb || ''))) {
      reasons.push('V4 fremde Schrift');
    }
  }

  // V6
  const feldNamen = new Set(def.fields.map((f) => f.name));
  if (feldNamen.has('telefon')) {
    const tel = String(fields.telefon || '').trim();
    const ziffern = (tel.match(/\d/g) || []).length;
    if (tel !== '' && ziffern < 6) reasons.push('V6 Telefon zu kurz');
  }
  if (feldNamen.has('name')) {
    const nm = String(fields.name || '').replace(/\s/g, '');
    if (nm !== '' && /^\d+$/.test(nm)) reasons.push('V6 Name nur Ziffern');
  }

  return reasons;
}

// Harte stille Ablehnung: alle nicht-leeren Freitextfelder bestehen NUR aus
// Links, ohne weiteren Text (Teil 4).
function nurLinks(def, fields) {
  const texts = freitextWerte(def, fields);
  if (!texts.length) return false;
  return texts.every((t) => {
    const ohneLinks = t.replace(/https?:\/\/\S+/gi, ' ').replace(/\bwww\.\S+/gi, ' ');
    return ohneLinks.trim() === '' && LINK_RE.test(t);
  });
}

module.exports = {
  regelnFelder,
  nurLinks,
  FREITEXT,
  SPAM_WOERTER,
  DEUTSCHE_KUNDENFORMULARE,
  DOWNLOAD_FORMULARE,
};
