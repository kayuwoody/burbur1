/**
 * lib/server/vendorImport.ts — validate, match and save imported vendors.
 *
 * CONCEPT: the same function runs twice:
 *   dryRun = true  → work out what WOULD happen (create / update / error per
 *                    row) without writing anything; shown as the preview.
 *   dryRun = false → do it.
 * Because both runs use identical logic, what the admin previews is what
 * gets saved.
 *
 * Matching existing vendors (first hit wins):
 *   1. Vendor ID code   2. Email (case-insensitive)   3. Phone (digits,
 *   with Malaysian 01x / +601x treated as the same number)
 * A matched vendor is UPDATED with the non-empty cells only, so a sparse
 * spreadsheet never blanks out details already in the system. Social links
 * are merged, not replaced.
 */
import { supabase } from './supabase';
import { HttpError, must } from './auth';
import { cleanVendorInput, vendorWriteError } from './vendors';
import { waNumber } from '../util';
import type { ImportResult, ImportRow, ImportRowResult } from '../vendorImport';
import type { Vendor } from '../types';

const MAX_ROWS = 3000;

type Existing = Pick<Vendor, 'id' | 'vendor_code' | 'email' | 'phone' | 'social_links' | 'business_name'>;

/** Loose email check: something@something.something */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function importVendors(input: ImportRow[], dryRun: boolean): Promise<ImportResult> {
  if (!Array.isArray(input) || input.length === 0) throw new HttpError(400, 'No rows to import');
  if (input.length > MAX_ROWS) throw new HttpError(400, `Too many rows (max ${MAX_ROWS} per import)`);

  // ---- Load everything we match against, in one round trip ----
  const [vendorsRes, typesRes] = await Promise.all([
    supabase.from('vendors').select('id, vendor_code, email, phone, social_links, business_name'),
    supabase.from('vendor_types').select('id, name, sort_order'),
  ]);
  const existing = must(vendorsRes) as Existing[];
  const types = must(typesRes) as { id: number; name: string; sort_order: number }[];

  // Lookup tables for matching.
  const byCode = new Map(existing.map((v) => [v.vendor_code.toUpperCase(), v]));
  const byEmail = new Map(existing.filter((v) => v.email).map((v) => [v.email!.toLowerCase(), v]));
  const byPhone = new Map(existing.filter((v) => waNumber(v.phone)).map((v) => [waNumber(v.phone)!, v]));
  const typeByName = new Map(types.map((t) => [t.name.toLowerCase(), t]));

  // Track keys already used earlier in THIS file, to catch duplicate rows.
  const seenCode = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  const seenTarget = new Map<string, number>(); // existing vendor id → line

  const results: ImportRowResult[] = [];
  const creates: { fields: Partial<Vendor>; typeName?: string; line: number }[] = [];
  const updates: { id: string; fields: Partial<Vendor>; typeName?: string; line: number }[] = [];
  const newTypes = new Set<string>();

  for (const raw of input) {
    const line = Number(raw.line) || 0;
    const name = String(raw.business_name ?? '').trim();
    const fail = (message: string) => results.push({ line, name: name || '(no name)', action: 'error', message });

    // ---- Validate & normalise ----
    if (!name) {
      fail('Business name is empty');
      continue;
    }
    const email = raw.email?.trim().toLowerCase() || undefined;
    if (email && !looksLikeEmail(email)) {
      fail(`Email "${raw.email}" doesn't look valid`);
      continue;
    }
    const code = raw.vendor_code?.trim().toUpperCase() || undefined;
    const phoneKey = waNumber(raw.phone) ?? undefined;

    // Duplicates within the file itself.
    const dup =
      (code && seenCode.get(code)) || (email && seenEmail.get(email)) || (phoneKey && seenPhone.get(phoneKey));
    if (dup) {
      fail(`Same vendor ID, email or phone as row ${dup}`);
      continue;
    }

    // Reuse the normal vendor rules (trim, https:// on links, dedupe socials…).
    const fields = cleanVendorInput(
      {
        business_name: name,
        contact_name: raw.contact_name,
        offerings: raw.offerings,
        address: raw.address,
        phone: raw.phone,
        email,
        website: raw.website,
        notes: raw.notes,
        social_links: raw.social_links,
        ...(code ? { vendor_code: code } : {}),
      },
      { admin: true },
    );

    // Vendor type by name; unknown names become new types.
    const typeName = raw.vendor_type?.trim() || undefined;
    if (typeName && !typeByName.has(typeName.toLowerCase())) newTypes.add(typeName);

    // ---- Match an existing vendor ----
    let match: Existing | undefined;
    let matchedBy: string | undefined;
    if (code && byCode.get(code)) [match, matchedBy] = [byCode.get(code), 'vendor ID'];
    else if (email && byEmail.get(email)) [match, matchedBy] = [byEmail.get(email), 'email'];
    else if (phoneKey && byPhone.get(phoneKey)) [match, matchedBy] = [byPhone.get(phoneKey), 'phone'];

    if (match) {
      // A vendor ID in the file that belongs to a DIFFERENT existing vendor.
      const codeOwner = code ? byCode.get(code) : undefined;
      if (codeOwner && codeOwner.id !== match.id) {
        fail(`Vendor ID ${code} already belongs to ${codeOwner.business_name}`);
        continue;
      }
      const prev = seenTarget.get(match.id);
      if (prev) {
        fail(`Matches the same existing vendor as row ${prev}`);
        continue;
      }
      seenTarget.set(match.id, line);

      // Only overwrite with values that are actually filled in.
      const filled = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)),
      ) as Partial<Vendor>;
      if (filled.social_links) {
        filled.social_links = [...new Set([...(match.social_links ?? []), ...filled.social_links])].slice(0, 10);
      }
      updates.push({ id: match.id, fields: filled, typeName, line });
      results.push({ line, name, action: 'update', matchedBy, existingCode: match.vendor_code });
    } else {
      creates.push({ fields, typeName, line });
      results.push({ line, name, action: 'create' });
    }

    if (code) seenCode.set(code, line);
    if (email) seenEmail.set(email, line);
    if (phoneKey) seenPhone.set(phoneKey, line);
  }

  const summary = (): ImportResult => ({
    dryRun,
    created: results.filter((r) => r.action === 'create').length,
    updated: results.filter((r) => r.action === 'update').length,
    errors: results.filter((r) => r.action === 'error').length,
    newTypes: [...newTypes],
    rows: results,
  });
  if (dryRun) return summary();

  // ---- Commit ----
  // 1) Create missing vendor types, appended after the existing ones.
  if (newTypes.size) {
    let order = Math.max(0, ...types.map((t) => t.sort_order));
    const inserted = must(
      await supabase
        .from('vendor_types')
        .insert([...newTypes].map((name) => ({ name, sort_order: ++order })))
        .select('id, name, sort_order'),
    ) as { id: number; name: string; sort_order: number }[];
    inserted.forEach((t) => typeByName.set(t.name.toLowerCase(), t));
  }
  const typeId = (n?: string) => (n ? typeByName.get(n.toLowerCase())?.id ?? null : undefined);

  // 2) New vendors: bulk insert in chunks (vendor IDs auto-assigned when blank).
  for (let i = 0; i < creates.length; i += 500) {
    const chunk = creates.slice(i, i + 500).map((c) => {
      const t = typeId(c.typeName);
      return t === undefined ? c.fields : { ...c.fields, vendor_type_id: t };
    });
    // defaultToNull: false → when rows have different columns filled (e.g.
    // some have a vendor ID, some don't), the gaps take the column DEFAULT
    // (auto vendor ID, empty social list) instead of NULL.
    const { error } = await supabase.from('vendors').insert(chunk, { defaultToNull: false });
    if (error) throw vendorWriteError(error);
  }

  // 3) Updates: one request per vendor, 10 at a time.
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(
      updates.slice(i, i + 10).map(async (u) => {
        const t = typeId(u.typeName);
        const fields = t === undefined ? u.fields : { ...u.fields, vendor_type_id: t };
        if (!Object.keys(fields).length) return;
        const { error } = await supabase.from('vendors').update(fields).eq('id', u.id);
        if (error) throw vendorWriteError(error);
      }),
    );
  }

  return summary();
}
