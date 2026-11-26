# CLAUDE.md — burbur1

Event stall booking system. Next.js 14 App Router on Vercel, its **own** Supabase project (unrelated to bubu1). Manual bank transfer payments; WhatsApp via wa.me click-to-chat links.

## Deployment
- **Repo**: `kayuwoody/burbur1`
- Hosting: Vercel, functions pinned to `sin1` (Singapore) in `vercel.json` to sit next to the Supabase project. If the Supabase region changes, change this too.

## Env vars
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY      (the sb_secret_… key; legacy service_role also works)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  (the sb_publishable_… key)
NEXT_PUBLIC_SITE_URL
```

## Architecture
- Browser uses Supabase **only for auth** (`lib/supabaseBrowser.ts`). All data goes through `/api/*` routes using the secret-key client (`lib/server/supabase.ts`). RLS is **enabled with no policies** and function EXECUTE is revoked from anon/authenticated (`003_lockdown.sql`), so the publishable key can't touch data. Any new table/function must be added to that lockdown.
- `lib/api.ts` attaches `Authorization: Bearer <access_token>`; routes call `requireUser` / `requireVendor` / `requireAdmin` from `lib/server/auth.ts` and are wrapped in `handle()` (throw `HttpError` for 4xx).
- Admins = rows in `admins` table. Vendors = `vendors.auth_user_id`.
- Client pages guard with `useRequireAuth('user'|'vendor'|'admin')` (navigation only; the server is the real check).
- Route files may only export HTTP handlers + config; shared helpers go in `lib/server/`.
- Auth uses `supabase.auth.getClaims(token)` (local JWT verification), not `getUser` (network trip).
- Performance: every DB call is a network round trip. Group independent calls with `Promise.all` (e.g. auth check ‖ `expireStaleHolds()` ‖ reads that don't depend on expiry). Mutations should return the refreshed data rather than forcing a second fetch.

## Data model (supabase/migrations/001_init.sql)
- `layouts` (+ `blocks` jsonb for grey shapes) / `layout_stalls` (x,y,w,h): master floor plan (`main` = original 34 booths; `main2` = 39 booths incl. 35–39, default for new events, `012_layout_v2.sql`)
- `events`: id = `YYMMDD` of `start_date`; `end_date` (≥ start, may cross months); status `draft|open|closed`. Bookable until `end_date` passes (MYT). Columns renamed in `004_event_date_range.sql`; later migrations are append-only.
- `event_stalls`: (event_id, stall_no) → vendor_id, price, power_watts, status `available|held|booked|blocked`, booking_id, hold_expires_at (blocked stalls are left out of the vendor map response entirely, see `loadEventDetail`)
- `bookings` (status `pending_payment|payment_submitted|confirmed|cancelled|expired`, `ref` short code) + `booking_items` (price snapshot)
- `vendors`: `vendor_code` (auto `V0001` via `next_vendor_code()`, admin-editable, unique), `vendor_type_id` → `vendor_types`, `offerings`, `contact_name` (contact person), `phone` (WhatsApp), `email`, `address`, `website` (single, own site), `social_links text[]` (any number; platform detected from domain by `socialPlatform()` in `lib/util.ts`, see `006_social_links.sql`), `notes` (admin-only). Legacy `category` and `office_phone` columns are unused (copied into `offerings` by `005_vendor_details.sql`). Field rules live in `lib/server/vendors.ts` (`cleanVendorInput` with `admin` flag).
- `vendor_types`: admin-managed list (Settings page); delete refused while in use. Forms use a type-to-search box (`components/VendorTypeSelect.tsx`): suggestions filter as you type; text that matches no type is sent as `vendor_type_name`, resolved by `resolveVendorType()` (case-insensitive match, else created). Contact person + phone are required on vendor profile and admin forms (`requireContactFields`), not on CSV import.
- Vendor CSV import: parsing/mapping in `lib/vendorImport.ts` (browser), validation/matching/saving in `lib/server/vendorImport.ts` (same code for dry-run preview and commit). Bulk inserts use `defaultToNull: false` so missing keys take column defaults.
- `settings` (single row id=1): bank details, hold_hours, company details printed on documents, `social_links` (market's own pages, footer "Follow us"; `008_site_social_links.sql`). Public subset via `/api/site`.
- Branding: public site = Good Vibes Only Market (badge `public/brand/gvo-logo-*.png`, teal/terracotta/yellow, Amatic SC + Nunito); admin + invoices = Maniacs Mansion (coin logo).
- `documents` (`007_documents.sql`): invoices/receipts as snapshots (bill-to, lines jsonb, total). Invoice per (event, vendor, booking|null); receipt per invoice, number = invoice + 'R'. Numbers from `issue_document()` (locks event row; `events.doc_prefix` + `doc_next_no`, 5 digits; idempotent). Voided (not deleted) by `admin_booking_action('cancel')` and `expire_stale_holds()`. PDF via pdf-lib in `lib/server/pdf.ts`; public link `/api/documents/<access_token>`. Issuing helpers in `lib/server/documents.ts` (`syncBookingDocuments` on checkout/confirm/booking view). Built-in PDF fonts can't render CJK (replaced with '?').
- `events.venue` printed in invoice line items
- `vendor_event_setup` (`010_vendor_setup_forms.sql`): one row per (event, vendor) with `access_token`; `workers` jsonb [{name, ic}] (≥1 to submit; IC normalised to 900101-14-5678, or passport), `extra_power` (null = unanswered), `power_items` jsonb [{device, watts}] (0+). Public form `/setup/<token>` + `/api/setup/[token]` (editable until event end_date). Rows created on demand by `ensureSetupRows()` (`lib/server/setup.ts`): admin Setup page, `attachSetupLinks()` for confirmed bookings (WhatsApp confirmation + vendor booking page), and admin vendor picker (POST). Admin UI masks ICs; CSV export has them in full.
- `notification_log`: WhatsApp sends per event/vendor. Admin Notify can announce several events in one message (`{events}` placeholder = bullet list with links); a Copy (per-vendor button: copies the personalised message to paste into an open WhatsApp tab; "Open chat" reuses one tab named `whatsapp`) logs one row per ticked event. Preferred path is a WhatsApp Business **broadcast list**: Notify downloads the audience as a .vcf (`lib/vcard.ts`, split per 256 = list limit), copies one non-personalised message, and "Mark N as notified" bulk-logs (`vendor_ids`). Broadcasts only reach vendors who saved our number, hence `components/SaveContact.tsx` ("Save our number" .vcf from settings contact_phone) in the footer, profile (when opted in) and confirmed bookings. WhatsApp Cloud API automation is planned later.
- Storage bucket `payment-receipts` (private; signed URLs)

## SQL functions (keep booking state changes here, not in JS)
- `expire_stale_holds()`: lazy expiry, called at the top of availability reads/writes
- `create_booking(vendor_id, items jsonb)`: row-locks, re-checks, holds all-or-nothing; raises `STALL_UNAVAILABLE:<event>/<stall>,…`
- `admin_booking_action(booking_id, 'confirm'|'cancel', note)`
- `swap_stalls(event_id, a, b)` (`011_swap_stalls.sql`): swaps occupancy (vendor, booking, status, hold) of two stalls; price/power stay with the place; updates booking_items stall_no and live documents' "(Booth X)" text. Admin map: select exactly 2 stalls → Swap; `/api/admin/events/[id]/swap` returns `moved` for WhatsApp heads-up.

## Conventions
- Malaysia time for "today": `todayMYT()` in `lib/util.ts`.
- Stall numbers sort naturally with `compareStallNo` ('3' < '3A' < '5' < '10').
- Money columns are `numeric`; coerce with `Number()` when reading via PostgREST.
- Admin stall edits never change status of stalls tied to an online booking. Use booking confirm/cancel.
- Code style: verbose doc comments explaining the concept of each function/section.

## Languages (i18n)
- Vendor-facing pages come in English, Chinese (中文) and Malay (BM). Phrases live in `lib/i18n.ts` (`DICTS.en` is the master; `zh`/`ms` are typed to have exactly the same keys, so a missing translation is a type error).
- `components/LanguageProvider.tsx`: `useT()` → `{ t, lang, locale, setLang }`; `LanguageSwitcher` in the header. Choice saved in the `lang` cookie (read server-side in `app/layout.tsx`, falls back to Accept-Language) so there's no flash of English.
- Pass `locale` to `formatDate` / `formatDateRange` / `formatDateTime` on vendor pages.
- Not translated: the admin area (forced to English), invoices/receipt PDFs, WhatsApp message templates, and server error messages.
