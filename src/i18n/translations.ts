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
    "footer.imprint": "Impressum",
    "footer.privacy": "Datenschutz",
    "nav.kochapp": "Koch-App",
  },
  en: {
    "nav.home": "Home",
    "nav.about": "About",
    "nav.contact": "Book a Demo",
    "footer.imprint": "Legal Notice",
    "footer.privacy": "Privacy Policy",
    "nav.kochapp": "Cook App",
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
