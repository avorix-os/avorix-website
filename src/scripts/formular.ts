// Anweisung 63: gemeinsame Absende-Logik fuer ALLE Formulare.
// - wartet vor dem Senden auf die ALTCHA-Loesung (loest notfalls aus),
// - haengt die Google-Ads-Klick-Kennung an,
// - liest die JSON-Antwort { ok, verdacht } und meldet sie zurueck,
// - zeigt bei einer abgelehnten Anfrage die Fehlermeldung unter dem Knopf
//   (ausser bei Download-Formularen, die immer den Download starten).
// Das Ereignis im dataLayer loest JEDES Formular selbst aus, und zwar nur bei
// ok === true && verdacht !== true.

export type Sprache = 'de' | 'en' | 'hu';
export type Variante = 'kunde' | 'bewerber';

interface Opt {
  sprache?: Sprache;
  variante?: Variante;
  whatsapp?: string; // Link fuer die Bewerber-/HU-Fehlermeldung
  download?: boolean; // Download-Formulare zeigen keine Fehlermeldung
}

// Fehlermeldungen (Teil 4), nach Sprache und Variante (Kunde = Telefon,
// Bewerber = WhatsApp). Der WhatsApp-Platzhalter wird durch einen Link ersetzt.
function fehlerText(opt: Opt): { pre: string; link?: { text: string; href: string }; post: string } {
  const s = opt.sprache || 'de';
  const wa = opt.whatsapp || '';
  if (opt.variante === 'bewerber') {
    if (s === 'en') return { pre: 'Your application could not be sent. Please try again in a moment, your details are kept. Or write to us on ', link: { text: 'WhatsApp', href: wa }, post: '.' };
    if (s === 'hu') return { pre: 'A jelentkezést nem sikerült elküldeni. Kérjük, próbáld meg újra, a megadott adataid megmaradnak. Vagy írj nekünk ', link: { text: 'WhatsAppon', href: wa }, post: '.' };
    return { pre: 'Deine Bewerbung konnte nicht gesendet werden. Bitte versuch es gleich noch einmal, deine Angaben bleiben erhalten. Oder schreib uns per ', link: { text: 'WhatsApp', href: wa }, post: '.' };
  }
  if (s === 'en') return { pre: 'Your request could not be sent. Please try again in a moment, your details are kept. Or call us: +49 7541 3973915 · info@avorix.de', post: '' };
  if (s === 'hu') return { pre: 'A jelentkezést nem sikerült elküldeni. Kérjük, próbáld meg újra, a megadott adataid megmaradnak. Vagy írj nekünk ', link: { text: 'WhatsAppon', href: wa }, post: '.' };
  return { pre: 'Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es gleich noch einmal, Ihre Angaben bleiben erhalten. Oder rufen Sie uns an: 07541 3973915 · info@avorix.de', post: '' };
}

function zeigeFehler(form: HTMLFormElement, opt: Opt) {
  let el = form.querySelector<HTMLElement>('[data-form-fehler]');
  if (!el) {
    el = document.createElement('p');
    el.setAttribute('data-form-fehler', '');
    el.setAttribute('role', 'alert');
    el.className = 'form-fehler';
    const knopf = form.querySelector('[type="submit"]');
    if (knopf && knopf.parentNode) knopf.parentNode.insertBefore(el, knopf.nextSibling);
    else form.appendChild(el);
    const t = fehlerText(opt);
    el.textContent = t.pre;
    if (t.link) {
      const a = document.createElement('a');
      a.href = t.link.href; a.textContent = t.link.text;
      a.target = '_blank'; a.rel = 'noopener'; a.className = 'typo-link';
      el.appendChild(a);
      el.appendChild(document.createTextNode(t.post));
    }
  }
  el.hidden = false;
}

function versteckeFehler(form: HTMLFormElement) {
  const el = form.querySelector<HTMLElement>('[data-form-fehler]');
  if (el) el.hidden = true;
}

// Auf eine gueltige ALTCHA-Loesung warten. Ist sie schon da, sofort weiter;
// sonst Pruefung ausloesen und auf 'verified' warten. Eine abgelaufene Loesung
// wird dabei neu geholt (ALTCHA laedt bei Ablauf neu).
function ensureAltcha(form: HTMLFormElement): Promise<boolean> {
  const widget = form.querySelector<HTMLElement & { verify?: () => void; getState?: () => string }>('altcha-widget');
  if (!widget) return Promise.resolve(true); // kein Widget -> nichts zu pruefen
  const feld = () => form.querySelector<HTMLInputElement>('[name="altcha"]');
  // Schneller Pfad: liegt schon eine Loesung im Feld, absenden. Die echte
  // Pruefung macht ohnehin der Server; der Client sorgt nur dafuer, dass eine
  // Loesung mitgeht (das Widget fuellt das Feld erst im Zustand 'verified').
  const vorhanden = feld();
  if (vorhanden && vorhanden.value) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let fertig = false;
    const onState = (ev: Event) => {
      const s = (ev as CustomEvent).detail && (ev as CustomEvent).detail.state;
      if (s === 'verified') { done(true); }
      else if (s === 'error') { done(false); }
    };
    function done(ok: boolean) {
      if (fertig) return;
      fertig = true;
      widget.removeEventListener('statechange', onState);
      resolve(ok);
    }
    widget.addEventListener('statechange', onState);
    try { if (typeof widget.verify === 'function') widget.verify(); } catch (e) { /* ignore */ }
    // Sicherheitsnetz: nach 20 s aufgeben (Loesung nehmen, falls doch da).
    setTimeout(() => { const f = feld(); done(!!(f && f.value)); }, 20000);
  });
}

function gclid(): string {
  try {
    const fn = (window as any).avorixGclid;
    return typeof fn === 'function' ? (fn() || '') : '';
  } catch (e) { return ''; }
}

export async function absenden(form: HTMLFormElement, opt: Opt = {}): Promise<{ ok: boolean; verdacht: boolean }> {
  versteckeFehler(form);
  const okAltcha = await ensureAltcha(form);
  if (!okAltcha) {
    if (!opt.download) zeigeFehler(form, opt);
    return { ok: false, verdacht: false };
  }
  try {
    const fd = new FormData(form);
    const g = gclid();
    if (g) fd.append('gclid', g);
    const res = await fetch(form.action, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
    const daten = await res.json().catch(() => null as any);
    const ok = !!(res.ok && daten && daten.ok === true);
    const verdacht = !!(daten && daten.verdacht === true);
    if (!ok) {
      if (!opt.download) zeigeFehler(form, opt);
      return { ok: false, verdacht };
    }
    return { ok: true, verdacht };
  } catch (e) {
    if (!opt.download) zeigeFehler(form, opt);
    return { ok: false, verdacht: false };
  }
}
