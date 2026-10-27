/**
 * components/VendorTypesManager.tsx — add / rename / delete vendor types
 * (shown on the admin Settings page).
 *
 * CONCEPT: vendors point at a type by id, so renaming a type instantly
 * relabels every vendor of that type. Deleting is only allowed for types no
 * vendor uses (the count is shown next to each), so nobody's type silently
 * disappears.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { invalidateVendorTypes } from './useVendorTypes';
import type { VendorType } from '@/lib/types';

export default function VendorTypesManager() {
  const [types, setTypes] = useState<VendorType[] | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ types: VendorType[] }>('/api/admin/vendor-types').then((r) => setTypes(r.types));
  }, []);

  useEffect(load, [load]);

  /** Run a change, then refresh this list and the shared dropdown cache. */
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      invalidateVendorTypes();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="card stack">
      <strong>Vendor types</strong>
      <table>
        <tbody>
          {types?.map((t) => (
            <tr key={t.id}>
              <td>
                {editing?.id === t.id ? (
                  <input value={editing.name} autoFocus onChange={(e) => setEditing({ id: t.id, name: e.target.value })} />
                ) : (
                  t.name
                )}
              </td>
              <td className="small muted">{t.vendor_count} vendor{t.vendor_count === 1 ? '' : 's'}</td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}>
                {editing?.id === t.id ? (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        run(async () => {
                          await api(`/api/admin/vendor-types/${t.id}`, { method: 'PATCH', body: { name: editing.name } });
                          setEditing(null);
                        })
                      }
                    >
                      Save
                    </button>{' '}
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => setEditing({ id: t.id, name: t.name })}>Rename</button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={!!t.vendor_count}
                      title={t.vendor_count ? 'In use: change those vendors’ type first' : undefined}
                      onClick={() => confirm(`Delete type "${t.name}"?`) && run(() => api(`/api/admin/vendor-types/${t.id}`, { method: 'DELETE' }))}
                    >
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim())
            run(async () => {
              await api('/api/admin/vendor-types', { method: 'POST', body: { name: newName } });
              setNewName('');
            });
        }}
      >
        <input placeholder="New type, e.g. Food & Beverage" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn" disabled={!newName.trim()}>Add type</button>
      </form>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
