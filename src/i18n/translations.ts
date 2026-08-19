export const languages = {
  de: "Deutsch",
  en: "English",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "de";

export const ui = {
  de: {
    "nav.home": "Startseite",
    "nav.about": "\u00dcber uns",
    "nav.contact": "Demo vereinbaren",
    "contact.eyebrow": "Kostenloses Erstgespräch",
    "contact.title": "Demo vereinbaren",
    "contact.intro":
      "Lernen Sie Avorix in einem persönlichen Demo-Gespräch kennen. Wir zeigen Ihnen, wie unsere Lösung Ihren Küchenbetrieb konkret unterstützt.",
    "contact.email": "E-Mail",
    "contact.form.name": "Name",
    "contact.form.email": "E-Mail",
    "contact.form.message": "Nachricht",
    "contact.form.submit": "Absenden",
    "contact.booking.heading": "Demo-Termin direkt buchen",
    "contact.booking.text": "Wählen Sie einfach einen freien Termin in unserem Kalender. Kein Telefonieren, kein Warten.",
    "contact.booking.button": "Termin auswählen",
    "contact.booking.note": "Kostenlos & unverbindlich · 30 Minuten",
    "contact.or": "Oder schreiben Sie uns",
    "footer.imprint": "Impressum",
    "footer.privacy": "Datenschutz",
    "nav.kochapp": "Koch-App",
    "nav.produkt": "Produkt",
  },
  en: {
    "nav.home": "Home",
    "nav.about": "About",
    "nav.contact": "Book a Demo",
    "contact.eyebrow": "Free Initial Consultation",
    "contact.title": "Book a Demo",
    "contact.intro": "Get to know Avorix in a personal demo call. We'll show you exactly how our solution supports your kitchen operations.",
    "contact.email": "Email",
    "contact.form.name": "Name",
    "contact.form.email": "Email",
    "contact.form.message": "Message",
    "contact.form.submit": "Send",
    "contact.booking.heading": "Book Your Demo Directly",
    "contact.booking.text": "Pick a free slot in our calendar — no phone calls, no waiting.",
    "contact.booking.button": "Select a Time",
    "contact.booking.note": "Free & no obligation · 30 minutes",
    "contact.or": "Or send us a message",
    "footer.imprint": "Legal Notice",
    "footer.privacy": "Privacy Policy",
    "nav.kochapp": "Cook App",
    "nav.produkt": "Product",
  },
} as const;

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split("/");
  if (lang in languages) return lang as Lang;
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]): string {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

export function getLocalizedPath(path: string, lang: Lang): string {
  if (lang === defaultLang) return path;
  return `/${lang}${path}`;
}
