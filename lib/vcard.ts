/**
 * lib/vcard.ts — build and download contact cards (.vcf files) in the browser.
 *
 * WHY: WhatsApp broadcast lists only deliver to people who have each other's
 * number saved. So we need two things:
 *   1. Admin: export vendors as contacts to import into the business phone,
 *      then pick them when building a broadcast list in WhatsApp Business.
 *   2. Vendors: a one-tap "Save our number" card for the market's number.
 *
 * CONCEPT: a .vcf file is plain text in the vCard 3.0 format, one
 * BEGIN:VCARD … END:VCARD block per contact. Phones (iOS/Android) and
 * Google Contacts all import it; opening one on a phone offers "Add contact".
 */
import { waNumber } from './util';

export type Contact = {
  /** Display name, e.g. "GVO · Kopi Co (Ali)". */
  name: string;
  /** Any phone format; normalised to +60… for the card. */
  phone: string | null;
  org?: string | null;
  /** Free text shown in the contact's notes. */
  note?: string | null;
  /** Labels/groups (e.g. vendor type); Google Contacts imports these as labels. */
  categories?: string[];
  url?: string | null;
};

/**
 * Escape text for a vCard value: backslash, comma, semicolon and newlines
 * have special meanings in the format and must be escaped.
 */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** One contact → one vCard block. Contacts without a usable phone return ''. */
export function vcard(c: Contact): string {
  const num = waNumber(c.phone);
  if (!num) return '';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${esc(c.name)}`,
    // N is "family;given;…"; putting the whole name in "given" keeps the
    // display name exactly as written on phones that build it from N.
    `N:;${esc(c.name)};;;`,
    `TEL;TYPE=CELL:+${num}`,
    c.org ? `ORG:${esc(c.org)}` : '',
    c.categories?.length ? `CATEGORIES:${c.categories.map(esc).join(',')}` : '',
    c.note ? `NOTE:${esc(c.note)}` : '',
    c.url ? `URL:${c.url}` : '',
    'END:VCARD',
  ];
  // vCard lines end with CRLF.
  return lines.filter(Boolean).join('\r\n');
}

/** Many contacts → the text of one .vcf file. */
export function vcardFile(contacts: Contact[]): string {
  return contacts.map(vcard).filter(Boolean).join('\r\n') + '\r\n';
}

/**
 * Trigger a download of text as a file (no server round trip): wrap it in a
 * Blob, point a temporary <a download> at it, and click it.
 */
export function downloadText(filename: string, text: string, mime = 'text/vcard;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
