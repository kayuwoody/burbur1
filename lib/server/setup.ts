/**
 * lib/server/setup.ts — vendor setup forms (work-pass crew + power needs).
 *
 * CONCEPT: one row per (event, vendor) in vendor_event_setup, holding a
 * secret access token. The form link /setup/<token> works without login.
 * Rows are created on demand (ensureSetupRows) whenever a link is needed:
 * on the admin Setup page, in WhatsApp confirmation messages and on the
 * vendor's booking page, so every booked vendor always has one.
 */
import { supabase } from './supabase';
import { HttpError, must } from './auth';

export interface SetupWorker {
  name: string;
  ic: string;
}
export interface SetupPowerItem {
  device: string;
  watts: number;
}
export interface SetupRow {
  id: string;
  event_id: string;
  vendor_id: string;
  access_token: string;
  workers: SetupWorker[];
  extra_power: boolean | null;
  power_items: SetupPowerItem[];
  submitted_at: string | null;
  updated_at: string | null;
}

const MAX_ROWS = 30;

/**
 * Make sure a setup row exists for each (event, vendor) pair and return
 * them all, keyed "eventId:vendorId". Existing rows are left untouched
 * (insert … on conflict do nothing), so this is safe to call repeatedly.
 */
export async function ensureSetupRows(pairs: { event_id: string; vendor_id: string }[]): Promise<Map<string, SetupRow>> {
  const uniq = [...new Map(pairs.map((p) => [`${p.event_id}:${p.vendor_id}`, p])).values()];
  const out = new Map<string, SetupRow>();
  if (!uniq.length) return out;

  const { error } = await supabase
    .from('vendor_event_setup')
    .upsert(uniq, { onConflict: 'event_id,vendor_id', ignoreDuplicates: true });
  if (error) throw new HttpError(500, error.message);

  const rows = must(
    await supabase
      .from('vendor_event_setup')
      .select('*')
      .in('event_id', [...new Set(uniq.map((p) => p.event_id))])
      .in('vendor_id', [...new Set(uniq.map((p) => p.vendor_id))]),
  ) as SetupRow[];
  rows.forEach((r) => out.set(`${r.event_id}:${r.vendor_id}`, r));
  return out;
}

/**
 * Normalise an IC / passport number.
 * Malaysian IC (12 digits, dashes/spaces optional) → '900101-14-5678'.
 * Anything else with letters is treated as a passport number: kept as typed
 * (uppercased), 5–20 letters/digits.
 */
export function normaliseIc(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  const digits = s.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits)) {
    return digits.length === 12 ? `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}` : null;
  }
  return /^[A-Z0-9]{5,20}$/.test(digits) ? digits : null;
}

/**
 * Validate a form submission and return the cleaned values.
 * Rules: at least 1 worker, each with a name and a valid IC/passport;
 * power answered yes/no; if yes, each listed item needs a name and watts
 * between 1 and 20,000. Blank rows (nothing typed) are ignored.
 */
export function cleanSetupInput(input: {
  workers?: unknown;
  extra_power?: unknown;
  power_items?: unknown;
}): Pick<SetupRow, 'workers' | 'extra_power' | 'power_items'> {
  const workersIn = Array.isArray(input.workers) ? input.workers : [];
  const workers: SetupWorker[] = [];
  workersIn.forEach((w: { name?: unknown; ic?: unknown }, i) => {
    const name = String(w?.name ?? '').trim().replace(/\s+/g, ' ');
    const icRaw = String(w?.ic ?? '').trim();
    if (!name && !icRaw) return; // empty row
    if (!name) throw new HttpError(400, `Worker ${i + 1}: please enter their full name`);
    const ic = normaliseIc(icRaw);
    if (!ic) throw new HttpError(400, `Worker ${i + 1}: IC must be 12 digits (or a valid passport number)`);
    workers.push({ name: name.slice(0, 100), ic });
  });
  if (!workers.length) throw new HttpError(400, 'Please list at least one person who will come to set up');
  if (workers.length > MAX_ROWS) throw new HttpError(400, `At most ${MAX_ROWS} workers`);

  if (typeof input.extra_power !== 'boolean') {
    throw new HttpError(400, 'Please answer whether you will bring anything beyond standard items');
  }
  const power_items: SetupPowerItem[] = [];
  if (input.extra_power) {
    const itemsIn = Array.isArray(input.power_items) ? input.power_items : [];
    itemsIn.forEach((p: { device?: unknown; watts?: unknown }, i) => {
      const device = String(p?.device ?? '').trim();
      const wattsRaw = String(p?.watts ?? '').trim();
      if (!device && !wattsRaw) return; // empty row
      if (!device) throw new HttpError(400, `Appliance ${i + 1}: please name the appliance or device`);
      const watts = Math.round(Number(wattsRaw.replace(/[^\d.]/g, '')));
      if (!(watts >= 1 && watts <= 20000)) throw new HttpError(400, `Appliance ${i + 1}: power must be a number of watts, e.g. 900`);
      power_items.push({ device: device.slice(0, 80), watts });
    });
    if (power_items.length > MAX_ROWS) throw new HttpError(400, `At most ${MAX_ROWS} appliances`);
  }
  return { workers, extra_power: input.extra_power, power_items };
}

/** Total watts of a vendor's listed appliances. */
export const powerTotal = (items: SetupPowerItem[] | null | undefined) =>
  (items ?? []).reduce((sum, p) => sum + Number(p.watts || 0), 0);

/**
 * Add setup-form links to CONFIRMED bookings (one per event in the booking),
 * as booking.setup = [{ event_id, access_token, submitted_at }]. Used by the
 * admin bookings list (WhatsApp message) and the vendor's booking page.
 */
export async function attachSetupLinks<
  B extends { status: string; vendor_id: string; items: { event_id: string }[]; setup?: unknown },
>(bookings: B[]): Promise<B[]> {
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  const pairs = confirmed.flatMap((b) => b.items.map((i) => ({ event_id: i.event_id, vendor_id: b.vendor_id })));
  if (!pairs.length) return bookings;
  const rows = await ensureSetupRows(pairs);
  for (const b of confirmed) {
    const events = [...new Set(b.items.map((i) => i.event_id))];
    b.setup = events
      .map((e) => rows.get(`${e}:${b.vendor_id}`))
      .filter(Boolean)
      .map((r) => ({ event_id: r!.event_id, access_token: r!.access_token, submitted_at: r!.submitted_at }));
  }
  return bookings;
}
