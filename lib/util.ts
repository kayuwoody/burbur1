/**
 * lib/util.ts — small pure helpers shared by server and browser code.
 */

/**
 * Today's date in Malaysia time (UTC+8) as YYYY-MM-DD.
 * CONCEPT: servers run in UTC, so "today" must be shifted by +8h before
 * slicing the date, or events would roll over at 8am local time.
 */
export function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Event id from an event date: '2026-11-15' → '261115' (YYMMDD).
 * The event id doubles as a human-readable reference.
 */
export function eventIdFromDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${y.slice(2)}${m}${d}`;
}

/** Format a YYYY-MM-DD date for display, e.g. 'Sun, 15 Nov 2026'. */
export function formatDate(isoDate: string): string {
  // Noon UTC avoids the date shifting when rendered in another timezone.
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format an event's date span for display.
 * CONCEPT: show only as much as needed so ranges stay short:
 *   same day        → 'Sun, 15 Nov 2026'
 *   same month      → '13 – 15 Nov 2026'
 *   across months   → '28 Nov – 6 Dec 2026'
 *   across years    → '30 Dec 2026 – 2 Jan 2027'
 */
export function formatDateRange(start: string, end: string): string {
  if (!end || start === end) return formatDate(start);
  const d = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-MY', { ...opts, timeZone: 'UTC' });
  const [sy, sm] = start.split('-');
  const [ey, em] = end.split('-');
  const endFull = d(end, { day: 'numeric', month: 'short', year: 'numeric' });
  if (sy !== ey) return `${d(start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${endFull}`;
  if (sm !== em) return `${d(start, { day: 'numeric', month: 'short' })} – ${endFull}`;
  return `${d(start, { day: 'numeric' })} – ${endFull}`;
}

/** Number of calendar days an event runs, inclusive (15–15 → 1, 15–17 → 3). */
export function eventDays(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

/** Format a timestamp in Malaysia time, e.g. '15 Nov, 3:05 pm'. */
export function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

/** Ringgit formatting: 150 → 'RM 150.00'. */
export function rm(amount: number | string | null | undefined): string {
  return `RM ${Number(amount ?? 0).toFixed(2)}`;
}

/**
 * Normalise a Malaysian phone number into WhatsApp's international format
 * (digits only, country code first, no '+').
 *   '012-345 6789'    → '60123456789'
 *   '+60 12 345 6789' → '60123456789'
 * Numbers already starting with another country code are left as digits.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return `6${digits}`; // local 01x → 601x
  return digits;
}

/**
 * Build a WhatsApp "click to chat" link with the message pre-typed.
 * CONCEPT: opening this link launches WhatsApp (app or web) on the admin's
 * device, using the company's existing WhatsApp Business account. The admin
 * just taps Send. No API account or per-message fee is needed.
 */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const num = waNumber(phone);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

/**
 * Fill {placeholders} in a message template.
 * fillTemplate('Hi {name}', { name: 'Ali' }) → 'Hi Ali'
 * Unknown placeholders are left untouched so typos are visible.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

/**
 * Natural sort for stall numbers so '3A' sits between '3' and '5', and '10'
 * comes after '9' (plain string sort would give '1','10','11','2'…).
 */
export function compareStallNo(a: string, b: string): number {
  const pa = /^(\d+)(.*)$/.exec(a);
  const pb = /^(\d+)(.*)$/.exec(b);
  if (pa && pb) {
    const diff = Number(pa[1]) - Number(pb[1]);
    return diff !== 0 ? diff : pa[2].localeCompare(pb[2]);
  }
  return a.localeCompare(b);
}

/** Human labels for booking statuses. */
export const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  payment_submitted: 'Receipt submitted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/**
 * Add 'https://' to a URL typed without a scheme ('instagram.com/shop').
 * CONCEPT: also neutralises odd schemes like 'javascript:' by treating
 * them as a host name, so stored links are always safe to put in an <a>.
 */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Known social platforms, matched against a URL's domain. */
const PLATFORMS: { name: string; domains: string[] }[] = [
  { name: 'Facebook', domains: ['facebook.com', 'fb.com', 'fb.me'] },
  { name: 'Instagram', domains: ['instagram.com'] },
  { name: 'TikTok', domains: ['tiktok.com'] },
  { name: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
  { name: 'X', domains: ['x.com', 'twitter.com'] },
  { name: 'Threads', domains: ['threads.net'] },
  { name: 'LinkedIn', domains: ['linkedin.com'] },
  { name: 'Shopee', domains: ['shopee.com.my', 'shopee.com', 'shp.ee'] },
  { name: 'Lazada', domains: ['lazada.com.my', 'lazada.com'] },
  { name: 'WhatsApp', domains: ['wa.me', 'whatsapp.com'] },
];

/**
 * Work out which platform a social URL belongs to, for labelling.
 * 'https://www.instagram.com/kopi.co' → { name: 'Instagram', handle: 'kopi.co' }
 * Unknown domains → { name: <domain> } so the link is still recognisable.
 */
export function socialPlatform(url: string): { name: string; handle: string | null } {
  try {
    const u = new URL(normalizeUrl(url));
    const host = u.hostname.replace(/^(www\.|m\.)/, '').toLowerCase();
    const p = PLATFORMS.find((pl) => pl.domains.some((d) => host === d || host.endsWith(`.${d}`)));
    // First path segment is usually the handle/page name (strip TikTok's '@').
    const first = u.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') ?? null;
    return { name: p?.name ?? host, handle: first };
  } catch {
    return { name: 'Link', handle: null };
  }
}

/**
 * Calendar date in Malaysia time for a timestamp: '2026-09-18T17:30:00Z' → '2026-09-19'.
 */
export function dateMYT(ts: string | number | Date): string {
  return new Date(new Date(ts).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Long date with ordinal, as on the company's invoices: '2026-09-19' → '19th September 2026'.
 * CONCEPT: 11th/12th/13th are the exceptions to the 1st/2nd/3rd rule.
 */
export function formatDocDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const ORDINAL: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  const suffix = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ORDINAL[d % 10] ?? 'th';
  return `${d}${suffix} ${month} ${y}`;
}

/**
 * Compact event dates for invoice line items, matching the existing style:
 *   same day   → '26 Sept 2026'
 *   same month → '26-27 Sept 2026'
 *   two months → '28 Nov - 6 Dec 2026'
 *   two years  → '30 Dec 2026 - 2 Jan 2027'
 */
export function docDateRange(start: string, end: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = (end || start).split('-').map(Number);
  if (sy !== ey) return `${sd} ${MONTHS[sm - 1]} ${sy} - ${ed} ${MONTHS[em - 1]} ${ey}`;
  if (sm !== em) return `${sd} ${MONTHS[sm - 1]} - ${ed} ${MONTHS[em - 1]} ${ey}`;
  if (sd !== ed) return `${sd}-${ed} ${MONTHS[sm - 1]} ${sy}`;
  return `${sd} ${MONTHS[sm - 1]} ${sy}`;
}

/** Amount as printed on documents: whole ringgit without decimals ('120'), else 2 dp ('120.50'). */
export function docAmount(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-MY') : n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Suggested invoice prefix for a new event: initials of the name + the
 * event id. 'Good Vibes Only' on 261128 → 'GVO261128'. Admins can change it.
 */
export function defaultDocPrefix(name: string, eventId: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 4);
  return `${initials || 'EV'}${eventId}`;
}

/** Public link to an invoice/receipt PDF (works without login; token is unguessable). */
export function documentUrl(token: string, origin = ''): string {
  return `${origin}/api/documents/${token}`;
}
