/**
 * POST /api/admin/vendors/import — bulk create/update vendors from a CSV.
 *
 * Body: { rows: ImportRow[], dryRun: boolean }
 *   dryRun true  → preview: what would be created / updated / rejected
 *   dryRun false → save, and return the same summary
 * The CSV itself is parsed in the browser; see lib/vendorImport.ts.
 */
import { NextResponse } from 'next/server';
import { handle, requireAdmin } from '@/lib/server/auth';
import { importVendors } from '@/lib/server/vendorImport';
import type { ImportRow } from '@/lib/vendorImport';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const { rows, dryRun } = (await req.json()) as { rows?: ImportRow[]; dryRun?: boolean };
  return NextResponse.json(await importVendors(rows ?? [], dryRun !== false));
});
