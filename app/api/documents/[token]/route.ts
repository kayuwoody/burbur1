/**
 * GET /api/documents/[token] — an invoice or receipt as a PDF.
 *
 * CONCEPT: no login needed; the link itself is the key. Each document has
 * a random, unguessable token (a UUID), so the link can be pasted into a
 * WhatsApp message and opened on the vendor's phone. Anyone without the
 * link can't find the document.
 *
 * ?download=1 forces a file download instead of opening in the browser.
 */
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must } from '@/lib/server/auth';
import { renderDocumentPdf } from '@/lib/server/pdf';
import type { DocumentRow, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = handle(async (req, { params }: { params: { token: string } }) => {
  // Reject malformed tokens before touching the database.
  if (!UUID.test(params.token)) throw new HttpError(404, 'Document not found');

  const [docRes, settingsRes] = await Promise.all([
    supabase.from('documents').select('*').eq('access_token', params.token).maybeSingle(),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);
  const doc = must(docRes) as DocumentRow | null;
  if (!doc) throw new HttpError(404, 'Document not found');

  const pdf = await renderDocumentPdf({ ...doc, total: Number(doc.total) }, must(settingsRes) as Settings);
  const download = new URL(req.url).searchParams.has('download');
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
