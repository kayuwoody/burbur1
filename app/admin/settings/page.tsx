/**
 * /admin/settings — bank details vendors pay into, the hold duration,
 * and the list of vendor types.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import VendorTypesManager from '@/components/VendorTypesManager';
import type { Settings } from '@/lib/types';

export default function AdminSettingsPage() {
  const { ready } = useRequireAuth('admin');
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (ready) api<{ settings: Settings }>('/api/admin/settings').then((r) => setS(r.settings));
  }, [ready]);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setS((p) => (p ? { ...p, [k]: e.target.value } : p));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: s });
      setS(r.settings);
      setMsg({ text: 'Saved.' });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Could not save', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !s) return <p className="muted">Loading…</p>;

  return (
    <div className="narrow">
      <h1>Settings</h1>
      <form className="card stack" onSubmit={save}>
        <strong>Bank transfer details</strong>
        <div><label>Bank</label><input value={s.bank_name ?? ''} onChange={set('bank_name')} /></div>
        <div><label>Account name</label><input value={s.bank_account_name ?? ''} onChange={set('bank_account_name')} /></div>
        <div><label>Account number</label><input value={s.bank_account_no ?? ''} onChange={set('bank_account_no')} /></div>
        <div>
          <label>Extra payment instructions (optional)</label>
          <textarea value={s.payment_note ?? ''} onChange={set('payment_note')} placeholder="e.g. Use your booking reference as the transfer reference." />
        </div>
        <strong>Holds</strong>
        <div>
          <label>Hours to hold stalls while awaiting payment</label>
          <input type="number" min={1} max={720} value={s.hold_hours} onChange={set('hold_hours')} />
          <div className="small muted">Unpaid bookings are released automatically after this. Bookings with an uploaded receipt are kept until you act.</div>
        </div>
        {msg && <p className={`small ${msg.error ? 'error' : 'success'}`}>{msg.text}</p>}
        <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
      </form>
      <VendorTypesManager />
    </div>
  );
}
