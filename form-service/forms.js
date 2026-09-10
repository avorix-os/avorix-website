// Formular-Definitionen fuer den Avorix-Formular-Dienst (Anweisung 45).
//
// Eine Kennung je Formular. Der Betreff wird HIER gesetzt, nie aus dem
// Formular uebernommen (Anweisung 45, 3.2 Punkt 2 + Abnahme Punkt 2).
//
// Feldlaengen nach 3.2 Punkt 3: Name 100, Betrieb 150, Freitext 5.000.
// Weitere Felder mit sinnvollen Obergrenzen.

const LEN = {
  name: 100,
  betrieb: 150,
  email: 254, // RFC-Obergrenze
  telefon: 40,
  ab_wann: 120,
  auswahl: 120,
  freitext: 5000,
};

// Feld-Definition: { name, required, max, header? }
// header:true -> Wert darf keine Zeilenumbrueche enthalten (3.2 Punkt 4),
//                weil er in eine Mail-Kopfzeile flieszen koennte.
function f(name, required, max, header = false) {
  return { name, required, max, header };
}

const FORMS = {
  kontakt: {
    lang: 'de',
    subject: 'Demo-Anfrage über avorix.de',
    fields: [
      f('name', true, LEN.name, true),
      f('email', true, LEN.email, true),
      f('message', true, LEN.freitext),
    ],
    ack: true,
  },
  personal: {
    lang: 'de',
    subject: 'Personal-Anfrage',
    fields: [
      f('betrieb', true, LEN.betrieb, true),
      f('name', true, LEN.name, true),
      f('telefon', true, LEN.telefon, true),
      f('email', false, LEN.email, true),
      f('ab_wann', true, LEN.ab_wann, true),
      f('hinweis', false, LEN.freitext),
    ],
    ack: true,
  },
  pilot: {
    lang: 'de',
    subject: 'Pilot-Anfrage über avorix.de',
    fields: [
      f('name', true, LEN.name, true),
      f('betrieb', true, LEN.betrieb, true),
      f('email', true, LEN.email, true),
      f('telefon', false, LEN.telefon, true),
      f('kuechenteam', false, LEN.auswahl, true),
      f('kuechenproblem', false, LEN.freitext),
    ],
    ack: true,
  },
  'en-contact': {
    lang: 'en',
    subject: 'Demo request via avorix.de',
    fields: [
      f('name', true, LEN.name, true),
      f('email', true, LEN.email, true),
      f('message', true, LEN.freitext),
    ],
    ack: true,
  },
  'en-staff': {
    lang: 'en',
    subject: 'Staff enquiry via avorix.de',
    fields: [
      f('betrieb', true, LEN.betrieb, true),
      f('name', true, LEN.name, true),
      f('telefon', true, LEN.telefon, true),
      f('email', false, LEN.email, true),
      f('ab_wann', true, LEN.ab_wann, true),
      f('hinweis', false, LEN.freitext),
    ],
    ack: true,
  },
  'en-pilot': {
    lang: 'en',
    subject: 'Pilot enquiry via avorix.de',
    fields: [
      f('name', true, LEN.name, true),
      f('betrieb', true, LEN.betrieb, true),
      f('email', true, LEN.email, true),
      f('telefon', false, LEN.telefon, true),
      f('kuechenteam', false, LEN.auswahl, true),
      f('kuechenproblem', false, LEN.freitext),
    ],
    ack: true,
  },
  // Sonderfall Leitfaden (Anweisung 45, 2.1):
  // - Redirect-Antwort bei Nicht-JS-Absendung auf die Download-Seite MIT Schraegstrich.
  // - verstecktes Feld `source` wandert in die Mail.
  // - eigenes, nicht vorausgewaehltes Werbe-Haekchen `newsletter` (Zustand in die Mail).
  //   Der Download haengt NICHT vom Haekchen ab.
  leitfaden: {
    lang: 'de',
    subject: 'Lead-Magnet: Leitfaden-Download',
    fields: [
      f('name', true, LEN.name, true),
      f('email', true, LEN.email, true),
      f('betrieb', false, LEN.betrieb, true),
      f('source', false, LEN.auswahl, true),
      // Werbe-Einwilligung: Checkbox. Wert (an/aus) wird dokumentiert.
      f('newsletter', false, 10, true),
    ],
    ack: true,
    // Redirect-Ziel relativ zu SITE_BASE (mit Schraegstrich, 2.1 Warnung).
    redirect: '/leitfaden/?download=1',
  },
  // Vorsorge fuer spaetere Bewerbungen (Anweisung 45, 3.3). Heute nutzt
  // kein Formular diese Kennung; der Weg ist bewusst schon da.
  bewerbung: {
    lang: 'de',
    subject: 'Bewerbung über avorix.de',
    fields: [
      f('name', true, LEN.name, true),
      f('email', true, LEN.email, true),
      f('telefon', false, LEN.telefon, true),
      f('einsatzgebiet', false, LEN.auswahl, true),
      f('nachricht', false, LEN.freitext),
    ],
    ack: false, // eigener Bewerbungs-Text spaeter, kein Standard-Ack
    attachments: true, // PDF/JPG/PNG, max 3, zusammen 10 MB (3.3)
    toBewerbung: true, // an bewerbung@ statt info@ (falls konfiguriert)
  },
};

module.exports = { FORMS, LEN };
