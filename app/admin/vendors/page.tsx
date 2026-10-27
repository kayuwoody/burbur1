/**
 * /admin/vendors — searchable client list + "Add vendor".
 *
 * Admin-added vendors don't need a login. If they later sign up with the
 * same email, their account is linked to this record automatically.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import VendorForm, { type VendorInput } from '@/components/VendorForm';
import type { Vendor } from '@/lib/types';

export default function AdminVendorsPage() {
  const { ready } = useRequireAuth('admin');
  const router = useRouter();
  const [q, setQ] = useState('');
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [adding, setAdding] = useState(false);

  /** Search runs server-side across name, contact, phone, email, category. */
  const load = useCallback((query: string) => {
    api<{ vendors: Vendor[] }>(`/api/admin/vendors${query ? `?q=${encodeURIComponent(query)}` : ''}`).then((r) =>
      setVendors(r.vendors),
    );
  }, []);

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [ready, q, load]);

  async function create(v: VendorInput) {
    const { vendor } = await api<{ vendor: Vendor }>('/api/admin/vendors', { method: 'POST', body: v });
    router.push(`/admin/vendors/${vendor.id}`);
  }

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="spread">
        <h1>Vendors</h1>
        <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : '+ Add vendor'}</button>
      </div>

      {adding && (
        <div className="card">
          <VendorForm submitLabel="Add vendor" onSubmit={create} />
        </div>
      )}

      <input placeholder="Search name, phone, email, category…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Business</th><th>Contact</th><th>Phone</th><th>Email</th><th>Category</th><th>Login</th><th>WA</th></tr>
          </thead>
          <tbody>
            {vendors?.map((v) => (
              <tr key={v.id} style={{ opacity: v.is_active ? 1 : 0.5 }}>
                <td><Link href={`/admin/vendors/${v.id}`}>{v.business_name}</Link></td>
                <td>{v.contact_name}</td>
                <td>{v.phone}</td>
                <td>{v.email}</td>
                <td>{v.category}</td>
                <td>{v.auth_user_id ? '✓' : ''}</td>
                <td>{v.whatsapp_opt_in ? '✓' : '—'}</td>
              </tr>
            ))}
            {vendors?.length === 0 && <tr><td colSpan={7} className="muted">No vendors found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
