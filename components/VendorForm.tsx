/**
 * components/VendorForm.tsx — admin form for creating/editing a vendor.
 * Used by both the "Add vendor" panel and the vendor detail page.
 */
'use client';

import { useState } from 'react';
import type { Vendor } from '@/lib/types';

export type VendorInput = Pick<
  Vendor,
  'business_name' | 'contact_name' | 'phone' | 'email' | 'category' | 'notes' | 'whatsapp_opt_in' | 'is_active'
>;

const EMPTY: VendorInput = {
  business_name: '',
  contact_name: '',
  phone: '',
  email: '',
  category: '',
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
  const [v, setV] = useState<VendorInput>({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  /** One setter for text inputs, textareas and checkboxes. */
  const set = (k: keyof VendorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

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
        <div><label>Business name *</label><input required value={v.business_name} onChange={set('business_name')} /></div>
        <div><label>Contact person</label><input value={v.contact_name ?? ''} onChange={set('contact_name')} /></div>
        <div><label>WhatsApp number</label><input type="tel" value={v.phone ?? ''} onChange={set('phone')} /></div>
        <div><label>Email (links their login)</label><input type="email" value={v.email ?? ''} onChange={set('email')} /></div>
        <div><label>Category</label><input value={v.category ?? ''} onChange={set('category')} /></div>
      </div>
      <div><label>Internal notes</label><textarea value={v.notes ?? ''} onChange={set('notes')} /></div>
      <div className="row">
        <label className="check"><input type="checkbox" checked={v.whatsapp_opt_in} onChange={set('whatsapp_opt_in')} /> WhatsApp opt-in</label>
        <label className="check"><input type="checkbox" checked={v.is_active} onChange={set('is_active')} /> Active</label>
      </div>
      {msg && <p className={`small ${msg.error ? 'error' : 'success'}`}>{msg.text}</p>}
      <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div>
    </form>
  );
}
