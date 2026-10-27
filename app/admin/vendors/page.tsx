/**
 * /admin/vendors — searchable client list + "Add vendor".
 *
 * Filter by vendor type with the tabs, search across vendor ID, names,
 * phones, email, offerings and address.
 * Admin-added vendors don't need a login. If they later sign up with the
 * same email, their account is linked to this record automatically.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/components/AuthProvider';
import { useVendorTypes } from '@/components/useVendorTypes';
import { api } from '@/lib/api';
import VendorForm, { type VendorInput } from '@/components/VendorForm';
import type { Vendor } from '@/lib/types';

export default function AdminVendorsPage() {
  const { ready } = useRequireAuth('admin');
  const router = useRouter();
  const types = useVendorTypes();
  const [q, setQ] = useState('');
  const [type, setType] = useState(''); // '' = all, 'none' = no type, else type id
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [adding, setAdding] = useState(false);

  /** Search + type filter both run server-side. */
  const load = useCallback((query: string, typeFilter: string) => {
    const qs = new URLSearchParams();
    if (query) qs.set('q', query);
    if (typeFilter) qs.set('type', typeFilter);
    api<{ vendors: Vendor[] }>(`/api/admin/vendors?${qs}`).then((r) => setVendors(r.vendors));
  }, []);

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => load(q, type), 250);
    return () => clearTimeout(t);
  }, [ready, q, type, load]);

  async function create(v: VendorInput) {
    const { vendor } = await api<{ vendor: Vendor }>('/api/admin/vendors', { method: 'POST', body: v });
    router.push(`/admin/vendors/${vendor.id}`);
  }

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="spread">
        <h1>Vendors</h1>
        <div className="row">
          <Link href="/admin/vendors/import" className="btn">Import CSV</Link>
          <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : '+ Add vendor'}</button>
        </div>
      </div>

      {adding && (
        <div className="card">
          <VendorForm submitLabel="Add vendor" onSubmit={create} />
        </div>
      )}

      <div className="tabs">
        <button className={`tab${type === '' ? ' active' : ''}`} onClick={() => setType('')}>All</button>
        {types.map((t) => (
          <button key={t.id} className={`tab${type === String(t.id) ? ' active' : ''}`} onClick={() => setType(String(t.id))}>
            {t.name}
          </button>
        ))}
        <button className={`tab${type === 'none' ? ' active' : ''}`} onClick={() => setType('none')}>No type</button>
      </div>

      <input
        placeholder="Search vendor ID, name, phone, email, offerings, address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Business</th><th>Type</th><th>Offerings</th><th>Contact</th><th>Phone</th><th>Email</th><th>Login</th><th>WA</th>
            </tr>
          </thead>
          <tbody>
            {vendors?.map((v) => (
              <tr key={v.id} style={{ opacity: v.is_active ? 1 : 0.5 }}>
                <td className="small">{v.vendor_code}</td>
                <td><Link href={`/admin/vendors/${v.id}`}>{v.business_name}</Link></td>
                <td>{v.vendor_type?.name}</td>
                {/* Long offerings are clipped; full text is on the detail page */}
                <td className="small" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.offerings ?? ''}>
                  {v.offerings}
                </td>
                <td>{v.contact_name}</td>
                <td>{v.phone}</td>
                <td>{v.email}</td>
                <td>{v.auth_user_id ? '✓' : ''}</td>
                <td>{v.whatsapp_opt_in ? '✓' : '—'}</td>
              </tr>
            ))}
            {vendors?.length === 0 && <tr><td colSpan={9} className="muted">No vendors found.</td></tr>}
          </tbody>
        </table>
      </div>
      {vendors && <p className="small muted">{vendors.length} vendor{vendors.length === 1 ? '' : 's'}</p>}
    </>
  );
}
