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
- `layouts` (+ `blocks` jsonb for grey shapes) / `layout_stalls` (x,y,w,h): master floor plan
- `events`: id = `YYMMDD` of `start_date`; `end_date` (≥ start, may cross months); status `draft|open|closed`. Bookable until `end_date` passes (MYT). Columns renamed in `004_event_date_range.sql`; later migrations are append-only.
- `event_stalls`: (event_id, stall_no) → vendor_id, price, power_watts, status `available|held|booked|blocked`, booking_id, hold_expires_at
- `bookings` (status `pending_payment|payment_submitted|confirmed|cancelled|expired`, `ref` short code) + `booking_items` (price snapshot)
- `vendors`: `vendor_code` (auto `V0001` via `next_vendor_code()`, admin-editable, unique), `vendor_type_id` → `vendor_types`, `offerings`, `contact_name` (contact person), `phone` (WhatsApp), `email`, `address`, `website` (single, own site), `social_links text[]` (any number; platform detected from domain by `socialPlatform()` in `lib/util.ts`, see `006_social_links.sql`), `notes` (admin-only). Legacy `category` and `office_phone` columns are unused (copied into `offerings` by `005_vendor_details.sql`). Field rules live in `lib/server/vendors.ts` (`cleanVendorInput` with `admin` flag).
- `vendor_types`: admin-managed list (Settings page); delete refused while in use
- `settings` (single row id=1): bank details, hold_hours
- `notification_log`: WhatsApp sends per event/vendor
- Storage bucket `payment-receipts` (private; signed URLs)

## SQL functions (keep booking state changes here, not in JS)
- `expire_stale_holds()`: lazy expiry, called at the top of availability reads/writes
- `create_booking(vendor_id, items jsonb)`: row-locks, re-checks, holds all-or-nothing; raises `STALL_UNAVAILABLE:<event>/<stall>,…`
- `admin_booking_action(booking_id, 'confirm'|'cancel', note)`

## Conventions
- Malaysia time for "today": `todayMYT()` in `lib/util.ts`.
- Stall numbers sort naturally with `compareStallNo` ('3' < '3A' < '5' < '10').
- Money columns are `numeric`; coerce with `Number()` when reading via PostgREST.
- Admin stall edits never change status of stalls tied to an online booking. Use booking confirm/cancel.
- Code style: verbose doc comments explaining the concept of each function/section.
