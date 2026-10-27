/**
 * components/useVendorTypes.ts — load the vendor type list once per page.
 *
 * CONCEPT: several screens need the same small list (Products / Services /
 * Activities …) for dropdowns and filters. A module-level promise means
 * the list is fetched once and shared, however many components ask for it.
 */
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { VendorType } from '@/lib/types';

let cache: Promise<VendorType[]> | null = null;

/** Force the next useVendorTypes() call to refetch (after admin edits). */
export function invalidateVendorTypes(): void {
  cache = null;
}

export function useVendorTypes(): VendorType[] {
  const [types, setTypes] = useState<VendorType[]>([]);
  useEffect(() => {
    if (!cache) {
      cache = api<{ types: VendorType[] }>('/api/vendor-types')
        .then((r) => r.types)
        .catch(() => {
          cache = null; // allow a retry on the next mount
          return [];
        });
    }
    let alive = true;
    cache.then((t) => alive && setTypes(t));
    return () => {
      alive = false;
    };
  }, []);
  return types;
}
