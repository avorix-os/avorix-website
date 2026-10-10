'use strict';

// Anweisung 63, Teil 2 (V3): Wegwerf-E-Mail-Domains.
// Startliste aus den haeufigsten Wegwerf-Anbietern (Quelle: Projekt
// `disposable-email-domains` auf GitHub). EINMAL IM MONAT aktualisieren:
// Liste von https://github.com/disposable-email-domains/disposable-email-domains
// (Datei disposable_email_blocklist.conf) ziehen und hier ersetzen.
// Als Set fuer schnelles Nachschlagen; Vergleich in server.js kleingeschrieben.

const LISTE = [
  '0-mail.com', '10minutemail.com', '10minutemail.net', '20minutemail.com',
  '33mail.com', 'anonbox.net', 'anonymbox.com', 'armyspy.com',
  'binkmail.com', 'bobmail.info', 'bugmenot.com', 'bumpymail.com',
  'cuvox.de', 'dayrep.com', 'deadaddress.com', 'despam.it',
  'discard.email', 'discardmail.com', 'discardmail.de', 'dispostable.com',
  'dropmail.me', 'dumpmail.de', 'e4ward.com', 'einrot.com',
  'email-temp.com', 'emailondeck.com', 'emailsensei.com', 'emailtemporanea.com',
  'emailtemporanea.net', 'emailtemporar.ro', 'emailthe.net', 'emailtmp.com',
  'emailwarden.com', 'emailx.at.hm', 'fakeinbox.com', 'fakemail.net',
  'fakemailgenerator.com', 'fastmail.fm.invalid', 'filzmail.com', 'fleckens.hu',
  'getairmail.com', 'getnada.com', 'gishpuppy.com', 'grr.la',
  'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com',
  'inboxalias.com', 'inboxbear.com', 'incognitomail.com', 'incognitomail.org',
  'jetable.org', 'jourrapide.com', 'kurzepost.de', 'lackmail.net',
  'mailcatch.com', 'maildrop.cc', 'maileater.com', 'mailexpire.com',
  'mailforspam.com', 'mailinator.com', 'mailinator.net', 'mailinator2.com',
  'mailmetrash.com', 'mailnesia.com', 'mailnull.com', 'mailtemp.info',
  'mailtothis.com', 'mailtrash.net', 'mintemail.com', 'mohmal.com',
  'moakt.com', 'mt2015.com', 'mytemp.email', 'mytrashmail.com',
  'no-spam.ws', 'nomail.xl.cx', 'nospam.ze.tc', 'nospamfor.us',
  'notmailinator.com', 'nowmymail.com', 'nurfuerspam.de', 'objectmail.com',
  'onewaymail.com', 'owlpic.com', 'pokemail.net', 'proxymail.eu',
  'rcpt.at', 'rtrtr.com', 'sharklasers.com', 'shitmail.me',
  'sibmail.com', 'slopsbox.com', 'smashmail.de', 'spam4.me',
  'spamavert.com', 'spambog.com', 'spambog.de', 'spambox.us',
  'spamcannon.com', 'spamcon.org', 'spamcorptastic.com', 'spamday.com',
  'spamex.com', 'spamfree24.com', 'spamfree24.de', 'spamgourmet.com',
  'spamhole.com', 'spaml.com', 'spamspot.com', 'spamthis.co.uk',
  'tempemail.com', 'tempemail.net', 'tempinbox.com', 'tempmail.com',
  'tempmail.de', 'tempmail.net', 'tempmail.org', 'tempmail2.com',
  'tempmailaddress.com', 'tempmailer.com', 'tempmailo.com', 'tempomail.fr',
  'temporaryemail.net', 'temporaryinbox.com', 'throwam.com', 'throwawaymail.com',
  'tmail.ws', 'tmailinator.com', 'trash-mail.com', 'trash-mail.de',
  'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net',
  'trashmail.org', 'trashmailer.com', 'trashymail.com', 'tyldd.com',
  'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  'wh4f.org', 'willhackforfood.biz', 'willselfdestruct.com', 'yopmail.com',
  'yopmail.fr', 'yopmail.net', 'yuurok.com', 'zehnminutenmail.de',
  'zippymail.info', 'tutanota.com', 'mail-temp.com', 'temp-mail.io',
  'luxusmail.org', 'burnermail.io', 'mailsac.com', 'tempr.email',
];

module.exports = new Set(LISTE.map((d) => d.toLowerCase()));
