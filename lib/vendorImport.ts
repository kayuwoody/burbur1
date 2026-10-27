/**
 * lib/vendorImport.ts — shared pieces of the vendor CSV import
 * (used by the browser page AND the server route).
 *
 * CONCEPT: an import is three steps:
 *   1. parseCsv()      — turn the file text into rows of cells
 *   2. column mapping  — decide which CSV column feeds which vendor field;
 *                        guessField() pre-fills this from the header names
 *   3. buildRows()     — apply the mapping to produce ImportRow objects,
 *                        which the server previews (dry run) then saves
 */

/** Vendor fields a CSV column can map to. 'social' and 'notes' accept several columns. */
export type ImportField =
  | 'ignore'
  | 'vendor_code'
  | 'business_name'
  | 'contact_name'
  | 'vendor_type'
  | 'offerings'
  | 'address'
  | 'phone'
  | 'email'
  | 'website'
  | 'social'
  | 'notes';

/** Dropdown labels, in the order shown on the mapping screen. */
export const IMPORT_FIELDS: { value: ImportField; label: string }[] = [
  { value: 'ignore', label: '— Ignore this column —' },
  { value: 'vendor_code', label: 'Vendor ID' },
  { value: 'business_name', label: 'Business name *' },
  { value: 'contact_name', label: 'Contact person' },
  { value: 'vendor_type', label: 'Vendor type' },
  { value: 'offerings', label: 'Offerings' },
  { value: 'address', label: 'Address' },
  { value: 'phone', label: 'Phone (WhatsApp)' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social media link(s)' },
  { value: 'notes', label: 'Notes' },
];

/** Fields where several CSV columns may be combined into one value. */
export const MULTI_FIELDS: ImportField[] = ['social', 'notes'];

/** One vendor as sent to the server. Only non-empty fields are set. */
export interface ImportRow {
  /** 1-based row number in the spreadsheet (header = row 1), for messages. */
  line: number;
  vendor_code?: string;
  business_name?: string;
  contact_name?: string;
  vendor_type?: string;
  offerings?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  social_links?: string[];
  notes?: string;
}

/** What the server will do / did with one row. */
export interface ImportRowResult {
  line: number;
  name: string;
  action: 'create' | 'update' | 'error';
  /** For updates: what matched the existing vendor (vendor ID, email, phone). */
  matchedBy?: string;
  /** For updates: the existing vendor's ID code. */
  existingCode?: string;
  message?: string;
}

export interface ImportResult {
  dryRun: boolean;
  created: number;
  updated: number;
  errors: number;
  /** Vendor type names that don't exist yet and will be / were created. */
  newTypes: string[];
  rows: ImportRowResult[];
}

/**
 * Parse CSV text into rows of cells.
 * CONCEPT: a small state machine that handles what Excel/Sheets produce:
 * quoted cells containing commas or line breaks, doubled quotes ("") inside
 * quotes, Windows line endings, and a leading byte-order mark. The
 * delimiter (comma, semicolon or tab) is detected from the header line,
 * since Excel in some locales saves "CSV" with semicolons.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'; // escaped quote
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully blank lines (common at the end of exported files).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Header keyword → field. Keys are lower-case with spaces/punctuation removed. */
const HEADER_GUESSES: Record<string, ImportField> = {
  vendorid: 'vendor_code', vendorcode: 'vendor_code', id: 'vendor_code', code: 'vendor_code', vendorno: 'vendor_code',
  business: 'business_name', businessname: 'business_name', vendor: 'business_name', vendorname: 'business_name',
  name: 'business_name', company: 'business_name', companyname: 'business_name', brand: 'business_name',
  shop: 'business_name', shopname: 'business_name', stallname: 'business_name',
  contact: 'contact_name', contactperson: 'contact_name', contactname: 'contact_name', person: 'contact_name',
  pic: 'contact_name', owner: 'contact_name',
  type: 'vendor_type', vendortype: 'vendor_type', category: 'vendor_type',
  offerings: 'offerings', offering: 'offerings', products: 'offerings', product: 'offerings', items: 'offerings',
  description: 'offerings', sells: 'offerings', whattheysell: 'offerings',
  address: 'address',
  phone: 'phone', phoneno: 'phone', phonenumber: 'phone', contactno: 'phone', contactnumber: 'phone',
  mobile: 'phone', mobileno: 'phone', hp: 'phone', handphone: 'phone', whatsapp: 'phone', tel: 'phone',
  email: 'email', emailaddress: 'email', mail: 'email',
  website: 'website', web: 'website', url: 'website', site: 'website',
  social: 'social', socialmedia: 'social', socials: 'social', facebook: 'social', fb: 'social',
  instagram: 'social', ig: 'social', tiktok: 'social', youtube: 'social', shopee: 'social', lazada: 'social',
  twitter: 'social', x: 'social', threads: 'social', linkedin: 'social',
  notes: 'notes', note: 'notes', remarks: 'notes', remark: 'notes', comments: 'notes',
};

/** Best guess for a CSV header, e.g. 'Contact no.' → 'phone'. */
export function guessField(header: string): ImportField {
  const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  return HEADER_GUESSES[key] ?? 'ignore';
}

/**
 * Guess mappings for all headers. A single-value field (e.g. Phone) is only
 * auto-assigned to its FIRST matching column, so two "phone-ish" columns
 * don't silently overwrite each other; the second is left as Ignore.
 */
export function guessMapping(headers: string[]): ImportField[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const f = guessField(h);
    if (f === 'ignore') return f;
    if (!MULTI_FIELDS.includes(f) && used.has(f)) return 'ignore';
    used.add(f);
    return f;
  });
}

/**
 * Apply a column mapping to the data rows.
 * - Social cells may hold several links separated by spaces, commas or
 *   new lines; each becomes its own entry.
 * - Several Notes columns are joined, each prefixed with its header so
 *   "Remarks: …" and "Last event: …" stay distinguishable.
 */
export function buildRows(headers: string[], data: string[][], mapping: ImportField[]): ImportRow[] {
  return data.map((cells, idx) => {
    const row: ImportRow = { line: idx + 2 };
    const notes: string[] = [];
    const social: string[] = [];
    mapping.forEach((field, col) => {
      const value = (cells[col] ?? '').trim();
      if (!value || field === 'ignore') return;
      if (field === 'social') social.push(...value.split(/[\s,]+/).filter(Boolean));
      else if (field === 'notes') notes.push(mapping.filter((m) => m === 'notes').length > 1 ? `${headers[col]}: ${value}` : value);
      else row[field] = value;
    });
    if (notes.length) row.notes = notes.join('\n');
    if (social.length) row.social_links = social;
    return row;
  });
}

/** Header row for the downloadable template file. */
export const TEMPLATE_HEADERS = [
  'Vendor ID', 'Business name', 'Contact', 'Vendor type', 'Offerings', 'Address', 'Phone', 'Email', 'Website',
  'Facebook', 'Instagram', 'TikTok', 'Notes',
];
