/**
 * lib/types.ts — shared TypeScript shapes used by both API routes and pages.
 *
 * CONCEPT: these mirror the Supabase tables in supabase/migrations/001_init.sql.
 * Keeping them in one file means a column rename shows up as a type error
 * everywhere it's used.
 */

/** Lifecycle state of a single stall within one event. */
export type StallStatus = 'available' | 'held' | 'booked' | 'blocked';

/** Lifecycle state of a vendor's checkout. */
export type BookingStatus =
  | 'pending_payment'
  | 'payment_submitted'
  | 'confirmed'
  | 'cancelled'
  | 'expired';

/** Event visibility: draft = admin only, open = bookable, closed = read only. */
export type EventStatus = 'draft' | 'open' | 'closed';

/** Admin-managed vendor classification (Products / Services / Activities …). */
export interface VendorType {
  id: number;
  name: string;
  sort_order: number;
  /** Only on the admin list: how many vendors use this type. */
  vendor_count?: number;
}

export interface Vendor {
  id: string;
  /** Human-readable ID, e.g. 'V0001'. Auto-assigned; admins may edit. */
  vendor_code: string;
  auth_user_id: string | null;
  business_name: string;
  contact_name: string | null;
  /** Contact no. — mobile / WhatsApp, used for notifications. */
  phone: string | null;
  /** Second phone line (office / landline). */
  office_phone: string | null;
  email: string | null;
  vendor_type_id: number | null;
  /** Embedded on admin reads: the type's name. */
  vendor_type?: { name: string } | null;
  /** Free text: what they actually sell / offer. */
  offerings: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  whatsapp_opt_in: boolean;
  is_active: boolean;
  created_at: string;
}

/** A non-bookable shape drawn on the map (shop lot, escalator, etc). */
export interface LayoutBlock {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  id: string;
  name: string;
  width: number;
  height: number;
  blocks: LayoutBlock[];
}

export interface EventRow {
  id: string; // YYMMDD
  name: string;
  start_date: string; // YYYY-MM-DD, also encoded in id as YYMMDD
  end_date: string; // YYYY-MM-DD, same as start_date for one-day events
  layout_id: string;
  status: EventStatus;
  notes: string | null;
  created_at: string;
}

/** Event plus stall counts, as returned by GET /api/events. */
export interface EventSummary extends EventRow {
  counts: { total: number; available: number; held: number; booked: number; blocked: number };
  min_price: number | null;
}

/**
 * A stall as drawn on the map: geometry from layout_stalls merged with the
 * per-event data from event_stalls.
 *
 * For vendors, `vendor_id`/`vendor_name`/`booking_id` are stripped and
 * `mine` tells the page whether the stall is held/booked by the viewer.
 */
export interface MapStall {
  stall_no: string;
  x: number;
  y: number;
  w: number;
  h: number;
  price: number;
  power_watts: number;
  status: StallStatus;
  mine?: boolean;
  vendor_id?: string | null;
  vendor_name?: string | null;
  booking_id?: string | null;
  hold_expires_at?: string | null;
}

export interface EventDetail {
  event: EventRow;
  layout: Layout;
  stalls: MapStall[];
}

export interface BookingItem {
  booking_id: string;
  event_id: string;
  stall_no: string;
  price: number;
  event?: Pick<EventRow, 'id' | 'name' | 'start_date' | 'end_date'> | null;
}

export interface Booking {
  id: string;
  ref: string;
  vendor_id: string;
  status: BookingStatus;
  total: number;
  receipt_path: string | null;
  expires_at: string | null;
  admin_note: string | null;
  created_at: string;
  confirmed_at: string | null;
  items: BookingItem[];
  vendor?: Pick<Vendor, 'id' | 'business_name' | 'contact_name' | 'phone' | 'email'> | null;
}

export interface Settings {
  hold_hours: number;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  payment_note: string | null;
}

/** One cart line, kept in localStorage until checkout. */
export interface CartItem {
  event_id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  stall_no: string;
  price: number;
}

/** Response of GET /api/me — who the logged-in user is. */
export interface MeResponse {
  user: { id: string; email: string | null };
  vendor: Vendor | null;
  isAdmin: boolean;
}
