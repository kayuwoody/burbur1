/**
 * components/DocumentLinks.tsx — buttons that open invoice/receipt PDFs.
 *
 * CONCEPT: each document has a secret link (/api/documents/<token>), so a
 * plain <a> works for vendors and admins alike, and the same link can be
 * pasted into WhatsApp. Voided documents are hidden unless `showVoid`.
 */
import { documentUrl } from '@/lib/util';
import type { DocumentSummary } from '@/lib/types';

export default function DocumentLinks({ docs, showVoid = false }: { docs?: DocumentSummary[] | null; showVoid?: boolean }) {
  const list = (docs ?? [])
    .filter((d) => showVoid || !d.voided_at)
    // Invoices before receipts, then by number.
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.number.localeCompare(b.number));
  if (!list.length) return null;
  return (
    <div className="row">
      {list.map((d) => (
        <a
          key={d.id}
          className="btn btn-sm"
          href={documentUrl(d.access_token)}
          target="_blank"
          rel="noreferrer"
          style={d.voided_at ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
        >
          📄 {d.kind === 'invoice' ? 'Invoice' : 'Receipt'} {d.number}
        </a>
      ))}
    </div>
  );
}
