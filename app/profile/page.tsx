/**
 * /profile — vendor creates or edits their own business profile.
 * Required before checkout, so admins always have a name + WhatsApp number.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const { ready, me, refresh } = useRequireAuth('user');
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    phone: '',
    category: '',
    whatsapp_opt_in: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Pre-fill from the existing profile once auth has loaded.
  useEffect(() => {
    const v = me?.vendor;
    if (v) {
      setForm({
        business_name: v.business_name ?? '',
        contact_name: v.contact_name ?? '',
        phone: v.phone ?? '',
        category: v.category ?? '',
        whatsapp_opt_in: v.whatsapp_opt_in,
      });
    }
  }, [me?.vendor]);

  /** Generic field setter so each input is a one-liner. */
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/api/me', { method: 'PUT', body: form });
      await refresh();
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) router.replace(next);
      else setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <div className="narrow card stack">
      <h1>{me?.vendor ? 'Your profile' : 'Tell us about your business'}</h1>
      <p className="muted small">Logged in as {me?.user.email}</p>
      <form onSubmit={submit} className="stack">
        <div>
          <label>Business / stall name *</label>
          <input required value={form.business_name} onChange={set('business_name')} />
        </div>
        <div>
          <label>Contact person</label>
          <input value={form.contact_name} onChange={set('contact_name')} />
        </div>
        <div>
          <label>WhatsApp number *</label>
          <input required type="tel" placeholder="012-345 6789" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label>What do you sell?</label>
          <input placeholder="e.g. Food, Crafts, Clothing" value={form.category} onChange={set('category')} />
        </div>
        <label className="check">
          <input type="checkbox" checked={form.whatsapp_opt_in} onChange={set('whatsapp_opt_in')} />
          Message me on WhatsApp when new events open
        </label>
        {error && <p className="error small">{error}</p>}
        {saved && <p className="success small">Saved.</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
