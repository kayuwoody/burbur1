/**
 * lib/server/pdf.ts — draw an invoice or receipt as an A4 PDF.
 *
 * CONCEPT: recreates the company's Word template with pdf-lib (pure
 * JavaScript, no browser needed on the server):
 *
 *   [logo]  company address
 *
 *                 INVOICE / RECEIPT          (dark red, centred)
 *   DATE: 19th September 2026
 *   INVOICE NO: GVO2609267-01206
 *   BILL TO / PAID BY: <bold vendor>  + address lines
 *   ┌ DESCRIPTION ───────────┬ PRICE (RM) ┬ TOTAL (RM) ┐   (red header row)
 *   │ Booth rental …         │ 120        │ 120        │
 *   PAY TO: … / Maybank 5147…                 (invoice only)
 *   footer: brand * Contact · name · phone · email
 *
 * PDF coordinates start at the BOTTOM-left, so the code keeps a `y` cursor
 * that moves down the page as each block is drawn.
 */
import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_JPG_BASE64 } from './brand/logo';
import { docAmount, formatDocDate } from '../util';
import type { DocumentRow, Settings } from '../types';

// ---- Template constants (from the Word document) ----
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 72; // 1 inch
const RED = rgb(0x99 / 255, 0, 0); // table header + title (#990000)
const DARK_RED = rgb(0x66 / 255, 0, 0); // account number (#660000)
const TEXT = rgb(0.12, 0.12, 0.12);
const GREY = rgb(0.35, 0.35, 0.35);
const BORDER = rgb(0.2, 0.2, 0.2);

/**
 * The built-in PDF fonts only cover Western European characters. Replace
 * anything else (e.g. Chinese names) with '?' rather than failing the whole
 * PDF. (Embedding a full Unicode font would fix this but adds ~MBs.)
 */
function safe(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.replace(/\t/g, ' ')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

/** Split text into lines that fit `maxWidth` at `size`, breaking on spaces. */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  // Split on line breaks BEFORE sanitising: '\n' isn't a printable glyph.
  for (const para of text.split(/\r?\n/).map((p) => safe(font, p))) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth || !line) line = test;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderDocumentPdf(doc: DocumentRow, settings: Settings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.kind === 'invoice' ? 'Invoice' : 'Receipt'} ${doc.number}`);
  pdf.setAuthor(settings.company_name ?? '');
  const font = await pdf.embedFont(StandardFonts.Helvetica); // metric-compatible with Arial
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedJpg(Buffer.from(LOGO_JPG_BASE64, 'base64'));

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  const contentW = A4.w - MARGIN * 2;

  /** Draw text at the cursor's x, with optional font/size/colour. */
  const text = (t: string, x: number, y: number, size = 11, f: PDFFont = font, color = TEXT) =>
    page.drawText(safe(f, t), { x, y, size, font: f, color });

  /** Footer on every page: "BRAND * Contact · name · phone · email". */
  const footer = () => {
    const parts = [settings.contact_name, settings.contact_phone, settings.contact_email].filter(Boolean).join('  ·  ');
    const line = `${settings.footer_brand ?? settings.company_name ?? ''}${parts ? ` * Contact  ·  ${parts}` : ''}`;
    text(line, MARGIN, 40, 7.5, font, GREY);
  };
  footer();

  // ---------- Header: logo + company address ----------
  const logoH = 112;
  const logoW = (logo.width / logo.height) * logoH;
  let y = A4.h - MARGIN + 20; // a little above the margin, as in the template
  page.drawImage(logo, { x: MARGIN - 10, y: y - logoH, width: logoW, height: logoH });
  const addrX = MARGIN - 10 + logoW + 10;
  const addrLines = wrap(font, settings.company_address ?? '', 8.5, A4.w - MARGIN - addrX);
  addrLines.forEach((l, i) => text(l, addrX, y - logoH + 22 + (addrLines.length - 1 - i) * 11, 8.5));
  y -= logoH + 46;

  // ---------- Title ----------
  const title = doc.kind === 'invoice' ? 'INVOICE' : 'RECEIPT';
  text(title, (A4.w - bold.widthOfTextAtSize(title, 24)) / 2, y, 24, bold, RED);
  y -= 46;

  // ---------- Date / number ----------
  text(`DATE: ${formatDocDate(doc.issued_on)}`, MARGIN, y);
  y -= 24;
  text(`${doc.kind === 'invoice' ? 'INVOICE' : 'RECEIPT'} NO: ${doc.number}`, MARGIN, y);
  y -= 34;

  // ---------- Bill to / Paid by ----------
  const label = doc.kind === 'invoice' ? 'BILL TO: ' : 'PAID BY: ';
  text(label, MARGIN, y);
  const nameX = MARGIN + font.widthOfTextAtSize(label, 11) + 2;
  for (const l of wrap(bold, doc.bill_to_name, 11, contentW - (nameX - MARGIN))) {
    text(l, nameX, y, 11, bold);
    y -= 14;
  }
  for (const l of wrap(font, doc.bill_to_address ?? '', 11, contentW)) {
    if (!l) continue;
    text(l, MARGIN, y);
    y -= 14;
  }
  y -= 26;

  // ---------- Line items table ----------
  const col = [contentW * 0.6, contentW * 0.2, contentW * 0.2]; // DESCRIPTION | PRICE | TOTAL
  const colX = [MARGIN, MARGIN + col[0], MARGIN + col[0] + col[1]];
  const pad = 6;
  const size = 10.5;
  const lineH = 13;

  /** Draw one table row and move the cursor below it. */
  const row = (cells: string[], opts: { header?: boolean; boldCells?: boolean } = {}) => {
    const f = opts.header || opts.boldCells ? bold : font;
    const descLines = wrap(f, cells[0], size, col[0] - pad * 2);
    const h = Math.max(1, descLines.length) * lineH + pad * 2;
    // New page if the row won't fit above the footer.
    if (y - h < 90) {
      page = pdf.addPage([A4.w, A4.h]);
      footer();
      y = A4.h - MARGIN;
    }
    if (opts.header) page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, color: RED });
    // Cell borders.
    colX.forEach((x, i) =>
      page.drawRectangle({ x, y: y - h, width: col[i], height: h, borderColor: BORDER, borderWidth: 0.75 }),
    );
    const color = opts.header ? rgb(1, 1, 1) : TEXT;
    descLines.forEach((l, i) => text(l, colX[0] + pad, y - pad - size + 1 - i * lineH, size, f, color));
    // Price and total are centred in their columns, as in the template.
    [cells[1], cells[2]].forEach((c, i) => {
      const w = f.widthOfTextAtSize(c, size);
      text(c, colX[i + 1] + (col[i + 1] - w) / 2, y - pad - size + 1, size, f, color);
    });
    y -= h;
  };

  // Whole ringgit print as '120'; if ANY amount has cents, show 2 dp everywhere so columns line up.
  const cents = doc.lines.some((l) => !Number.isInteger(Number(l.price)) || !Number.isInteger(Number(l.total)));
  const amt = (n: number) => (cents ? Number(n).toFixed(2) : docAmount(Number(n)));

  row(['DESCRIPTION', 'PRICE (RM)', 'TOTAL (RM)'], { header: true });
  for (const l of doc.lines) row([l.description, amt(l.price), amt(l.total)]);
  if (doc.lines.length > 1) row(['TOTAL', '', amt(doc.total)], { boldCells: true });
  y -= 40;

  // ---------- Payment details (invoice only) ----------
  if (doc.kind === 'invoice' && (settings.bank_account_no || settings.company_name)) {
    text(`PAY TO: ${settings.bank_account_name || settings.company_name || ''}`, MARGIN, y);
    y -= 18;
    const bank = `${settings.bank_name ?? ''} `;
    text(bank, MARGIN, y, 13, bold);
    text(settings.bank_account_no ?? '', MARGIN + bold.widthOfTextAtSize(safe(bold, bank), 13), y, 13, bold, DARK_RED);
  }

  // ---------- VOID stamp ----------
  if (doc.voided_at) {
    for (const p of pdf.getPages()) {
      p.drawText('VOID', { x: 150, y: 300, size: 140, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.25, rotate: degrees(35) });
    }
  }

  return pdf.save();
}
