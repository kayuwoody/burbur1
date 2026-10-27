/**
 * /admin/vendors/import — import the existing vendor list from a CSV file.
 *
 * Flow:
 *   1. Pick a CSV (Excel / Google Sheets → "Save as / Download → CSV").
 *   2. Check the column mapping: each column is auto-matched by its header
 *      name and can be changed with the dropdown.
 *   3. Preview: the server reports, per row, create / update / error,
 *      without saving anything.
 *   4. Import: the same logic runs for real.
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { invalidateVendorTypes } from '@/components/useVendorTypes';
import { api } from '@/lib/api';
import {
  buildRows,
  guessMapping,
  IMPORT_FIELDS,
  MULTI_FIELDS,
  parseCsv,
  TEMPLATE_HEADERS,
  type ImportField,
  type ImportResult,
} from '@/lib/vendorImport';

export default function VendorImportPage() {
  const { ready } = useRequireAuth('admin');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Read the chosen file, split header from data, and guess the mapping. */
  async function onFile(file: File | undefined) {
    setError(null);
    setPreview(null);
    setDone(null);
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError('That is an Excel file. In Excel use File → Save As → "CSV UTF-8", then choose that file.');
      return;
    }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setError('The file needs a header row and at least one vendor.');
      return;
    }
    setFileName(file.name);
    setHeaders(rows[0].map((h) => h.trim()));
    setData(rows.slice(1));
    setMapping(guessMapping(rows[0]));
  }

  /** Change one column's target field (and clear any stale preview). */
  function setColumn(col: number, field: ImportField) {
    setPreview(null);
    setMapping((m) => m.map((f, i) => (i === col ? field : f)));
  }

  // Problems with the mapping itself, shown before Preview is allowed.
  const mappingProblems = useMemo(() => {
    const problems: string[] = [];
    if (!mapping.includes('business_name')) problems.push('Choose which column is the Business name.');
    IMPORT_FIELDS.forEach(({ value, label }) => {
      if (value !== 'ignore' && !MULTI_FIELDS.includes(value) && mapping.filter((m) => m === value).length > 1) {
        problems.push(`"${label}" is chosen for more than one column.`);
      }
    });
    return problems;
  }, [mapping]);

  /** Send the mapped rows to the server, as a dry run or for real. */
  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>('/api/admin/vendors/import', {
        method: 'POST',
        body: { rows: buildRows(headers, data, mapping), dryRun },
      });
      if (dryRun) setPreview(result);
      else {
        setDone(result);
        setPreview(null);
        invalidateVendorTypes(); // new types may have been created
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  /** Download an empty CSV with the recommended columns. */
  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_HEADERS.join(',') + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vendor-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="spread">
        <h1>Import vendors</h1>
        <Link href="/admin/vendors" className="btn btn-sm">← Vendors</Link>
      </div>

      {/* ---------- Step 1: file ---------- */}
      <div className="card stack">
        <strong>1. Choose a CSV file</strong>
        <p className="small muted" style={{ margin: 0 }}>
          From Excel: File → Save As → CSV UTF-8. From Google Sheets: File → Download → CSV. The first row must be
          column headers. Vendors already in the system are matched by vendor ID, then email, then phone, and
          updated instead of duplicated. Empty cells never erase existing details.
        </p>
        <div className="row">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} style={{ maxWidth: 360 }} />
          <button className="btn btn-sm" onClick={downloadTemplate}>Download template</button>
        </div>
        {fileName && <div className="small">{fileName}: {data.length} rows</div>}
      </div>

      {error && <p className="card error">{error}</p>}

      {/* ---------- Step 2: mapping ---------- */}
      {headers.length > 0 && !done && (
        <div className="card stack">
          <strong>2. Check the columns</strong>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Column in your file</th><th>Example</th><th>Import as</th></tr>
              </thead>
              <tbody>
                {headers.map((h, col) => (
                  <tr key={col}>
                    <td>{h || <span className="muted">(no header)</span>}</td>
                    <td className="small muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.find((r) => r[col]?.trim())?.[col] ?? ''}
                    </td>
                    <td>
                      <select value={mapping[col]} onChange={(e) => setColumn(col, e.target.value as ImportField)}>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mappingProblems.map((p) => <p key={p} className="small error" style={{ margin: 0 }}>{p}</p>)}
          <div>
            <button className="btn btn-primary" disabled={busy || mappingProblems.length > 0} onClick={() => run(true)}>
              {busy && !preview ? 'Checking…' : 'Preview import'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Step 3: preview ---------- */}
      {preview && (
        <div className="card stack">
          <strong>3. Preview (nothing saved yet)</strong>
          <ResultSummary r={preview} />
          <ResultTable r={preview} />
          <div className="row">
            <button className="btn btn-ok" disabled={busy || preview.created + preview.updated === 0} onClick={() => run(false)}>
              {busy ? 'Importing…' : `Import ${preview.created + preview.updated} vendors`}
            </button>
            {preview.errors > 0 && <span className="small muted">Rows with errors are skipped. Fix them in the file and import again later.</span>}
          </div>
        </div>
      )}

      {/* ---------- Done ---------- */}
      {done && (
        <div className="card stack">
          <strong className="success">Import complete</strong>
          <ResultSummary r={done} />
          {done.errors > 0 && <ResultTable r={done} onlyErrors />}
          <div className="row">
            <Link href="/admin/vendors" className="btn btn-primary">View vendors</Link>
            <button className="btn" onClick={() => { setDone(null); setHeaders([]); setData([]); setFileName(null); }}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** One-line counts: "12 new · 3 updated · 1 error · new types: Food". */
function ResultSummary({ r }: { r: ImportResult }) {
  return (
    <div className="row">
      <span className="pill pill-confirmed">{r.created} {r.dryRun ? 'to create' : 'created'}</span>
      <span className="pill pill-payment_submitted">{r.updated} {r.dryRun ? 'to update' : 'updated'}</span>
      {r.errors > 0 && <span className="pill pill-cancelled">{r.errors} with errors (skipped)</span>}
      {r.newTypes.length > 0 && (
        <span className="small muted">New vendor types {r.dryRun ? 'to add' : 'added'}: {r.newTypes.join(', ')}</span>
      )}
    </div>
  );
}

/** Per-row outcome; errors listed first so they're easy to fix. */
function ResultTable({ r, onlyErrors }: { r: ImportResult; onlyErrors?: boolean }) {
  const order = { error: 0, update: 1, create: 2 };
  const rows = [...r.rows]
    .filter((x) => !onlyErrors || x.action === 'error')
    .sort((a, b) => order[a.action] - order[b.action] || a.line - b.line);
  return (
    <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
      <table>
        <thead>
          <tr><th>Row</th><th>Business</th><th>Result</th></tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.line}>
              <td className="small muted">{x.line}</td>
              <td>{x.name}</td>
              <td className="small">
                {x.action === 'create' && <span className="success">New vendor</span>}
                {x.action === 'update' && <span>Updates {x.existingCode} (matched by {x.matchedBy})</span>}
                {x.action === 'error' && <span className="error">{x.message}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
