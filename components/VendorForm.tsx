/**
 * components/VendorForm.tsx — admin form for creating/editing a vendor.
 * Used by both the "Add vendor" panel and the vendor detail page.
 *
 * Field groups mirror how the office thinks about a client:
 *   identity (vendor ID, business, type, offerings) → contact details & address
 *   → online presence → internal.
 */
'use client';

import { useState } from 'react';
import { useVendorTypes } from './useVendorTypes';
import { SocialLinksInput } from './SocialLinks';
import type { Vendor } from '@/lib/types';

export type VendorInput = Pick<
  Vendor,
  | 'vendor_code'
  | 'business_name'
  | 'vendor_type_id'
  | 'offerings'
  | 'contact_name'
  | 'phone'
  | 'email'
  | 'address'
  | 'website'
  | 'social_links'
  | 'notes'
  | 'whatsapp_opt_in'
  | 'is_active'
>;

const EMPTY: VendorInput = {
  vendor_code: '',
  business_name: '',
  vendor_type_id: null,
  offerings: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  social_links: [],
  notes: '',
  whatsapp_opt_in: true,
  is_active: true,
};

export default function VendorForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<VendorInput>;
  submitLabel: string;
  /** Should throw on failure; the error message is shown under the form. */
  onSubmit: (v: VendorInput) => Promise<void>;
}) {
  const types = useVendorTypes();
  const [v, setV] = useState<VendorInput>({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const isNew = !initial?.vendor_code;

  /** One setter for text inputs, textareas, selects and checkboxes. */
  const set =
    (k: keyof VendorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const t = e.target;
      const value =
        t instanceof HTMLInputElement && t.type === 'checkbox'
          ? t.checked
          : k === 'vendor_type_id'
            ? t.value
              ? Number(t.value)
              : null
            : t.value;
      setV((p) => ({ ...p, [k]: value }));
    };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await onSubmit(v);
      setMsg({ text: 'Saved.' });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Could not save', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="grid">
        <div>
          <label>Vendor ID</label>
          <input
            value={v.vendor_code ?? ''}
            onChange={set('vendor_code')}
            placeholder={isNew ? 'Auto (e.g. V0012)' : ''}
            style={{ textTransform: 'uppercase' }}
          />
        </div>
        <div><label>Business name *</label><input required value={v.business_name} onChange={set('business_name')} /></div>
        <div>
          <label>Vendor type</label>
          <select value={v.vendor_type_id ?? ''} onChange={set('vendor_type_id')}>
            <option value="">Not set</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label>Offerings: what they actually sell / offer</label>
        <textarea value={v.offerings ?? ''} onChange={set('offerings')} placeholder="e.g. Handmade batik scarves, tote bags" />
      </div>
      <div className="grid">
        <div><label>Contact person</label><input value={v.contact_name ?? ''} onChange={set('contact_name')} /></div>
        <div><label>Phone (WhatsApp)</label><input type="tel" value={v.phone ?? ''} onChange={set('phone')} /></div>
        <div><label>Email (links their login)</label><input type="email" value={v.email ?? ''} onChange={set('email')} /></div>
        <div><label>Website</label><input value={v.website ?? ''} onChange={set('website')} placeholder="example.com" /></div>
      </div>
      <div>
        <label>Address (printed on invoices &amp; receipts)</label>
        <textarea value={v.address ?? ''} onChange={set('address')} style={{ minHeight: 60 }} placeholder="Leave blank if unknown" />
      </div>
      <div>
        <label>Social media (as many as they have)</label>
        <SocialLinksInput value={v.social_links ?? []} onChange={(links) => setV((p) => ({ ...p, social_links: links }))} />
      </div>
      <div><label>Internal notes (never shown to the vendor)</label><textarea value={v.notes ?? ''} onChange={set('notes')} /></div>
      <div className="row">
        <label className="check"><input type="checkbox" checked={v.whatsapp_opt_in} onChange={set('whatsapp_opt_in')} /> WhatsApp opt-in</label>
        <label className="check"><input type="checkbox" checked={v.is_active} onChange={set('is_active')} /> Active</label>
      </div>
      {msg && <p className={`small ${msg.error ? 'error' : 'success'}`}>{msg.text}</p>}
      <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div>
    </form>
  );
}
