# Stall Booking

Online stall booking for events. Vendors log in, pick an event date, click stalls on the floor plan (like picking cinema seats), and pay by bank transfer. Admins create events, grey out stalls, confirm payments, manage vendors and send WhatsApp announcements.

**Stack:** Next.js 14 (App Router) on Vercel · Supabase (Postgres, Auth, Storage). This uses its **own Supabase project**, separate from any other app.

---

## Setup

### 1. Create the Supabase project
1. Create a new project at [supabase.com](https://supabase.com) (region: Singapore is closest to Malaysia).
2. In **SQL Editor**, run these files in order:
   - `supabase/migrations/001_init.sql`: tables, storage bucket, booking functions
   - `supabase/migrations/002_seed_layout.sql`: the master floor plan (34 stalls)
   - `supabase/migrations/003_lockdown.sql`: turns on RLS and blocks the public key from tables/functions (**required**)
   - `supabase/migrations/004_event_date_range.sql`: events get a start and end date
3. **Authentication → Providers → Email**: keep it enabled. Leave **Confirm email** ON, because it prevents someone from claiming a vendor record with an email they don't own.
4. **Authentication → URL Configuration**: set **Site URL** to your Vercel URL and add `https://<your-app>.vercel.app/**` to Redirect URLs.

### 2. Deploy to Vercel
1. Import the `burbur1` repo in Vercel.
2. Add the environment variables from `.env.example`:

   | Variable | Where to find it |
   |---|---|
   | `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → **Secret key** (`sb_secret_…`). Server only, never `NEXT_PUBLIC_`. (Legacy `service_role` also works.) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, **Publishable key** (`sb_publishable_…`). Used only for login. |
   | `NEXT_PUBLIC_SITE_URL` | Your Vercel URL, used in WhatsApp links |

### 3. Make yourself an admin
Sign up on the site with your email, confirm it, then run in the SQL editor:
```sql
insert into admins (auth_user_id, name)
select id, 'Your Name' from auth.users where email = 'you@example.com';
```
Log out and in again; an **Admin** link appears in the header.

### 4. Fill in settings
Admin → **Settings**: bank name, account name/number, and how many hours unpaid holds last (default 48).

### Local development
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

---

## How it works

### Vendor flow
1. **Events** (`/`): open events dated today or later.
2. **Map** (`/events/YYMMDD`): click available stalls to add them to the cart. Works across several dates.
3. **Cart** (`/cart`) → **Book**: all stalls are held at once, or none if any were just taken (those are removed from the cart with a message).
4. **Booking page** (`/bookings/:id`): bank details + upload transfer receipt.
5. Admin confirms → stalls show as booked.

Unpaid holds are released automatically after the hold time. Once a receipt is uploaded, the hold stays until an admin confirms or cancels.

### Admin flow
- **Events**: create with a start and end date (can span months). ID = `YYMMDD` of the start date; the end date can be changed later. Vendors can book until the end date passes. All layout stalls are copied in with a default price and power. New events start as **Draft** (hidden from vendors).
- **Event map**: click stalls to select (multi-select), then set price/power, **grey out (block)**, or **assign to a vendor directly** for offline arrangements. Switch the event to **Open** when ready. The panel shows booked revenue and power totals.
- **Bookings**: view the receipt, **Confirm payment** or **Cancel**, plus a WhatsApp button with a pre-written message.
- **Vendors**: search, add, edit, internal notes, booking history. Vendors you add without a login are linked automatically when they sign up with the same email.
- **Notify**: pick an event, write a message with `{name} {event} {date} {link}` placeholders, and tap **Send** per vendor. This opens WhatsApp with the message ready, using your existing WhatsApp Business app (free). Sends are logged so you can see who hasn't been told yet.

### Stall status
```
available ──checkout──▶ held ──admin confirms──▶ booked
    ▲                     │
    └──expired/cancelled──┘
blocked = greyed out for this event
```

### Double-booking protection
`create_booking()` (SQL) locks the requested stall rows, re-checks them, and holds them in one transaction. Two vendors clicking the same stall at the same time: one wins, the other gets a "just taken" message.

---

## Changing the floor plan
Stall positions live in `layout_stalls` (pixel coordinates on an 830×1050 canvas, traced from the original layout image). Edit rows there to add/move stalls; new events pick up the change. Existing events keep their stall list.

## Roadmap
- Power grid view: assign stalls to circuits/DBs with capacity, and show per-circuit load on the map.
- Create and lay out events by drawing on the map.
- Official WhatsApp Business API for automatic messages (swap the link click in `/api/admin/notify` for an API call).
- CSV import of existing vendor list.
