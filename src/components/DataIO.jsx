import React, { useEffect, useRef, useState } from 'react';
import { downloadCsv, parseCsv, readFileText } from './csv.js';
import Ico from './Icon.jsx';

/*
 * Shared data in / out for list pages.
 *  <ExportButtons title filename columns rows />  → "CSV" and "PDF" download of exactly what the table shows.
 *     columns = [[header, (row) => value], ...]
 *  <ImportButtons format={{ filename, headers, sample }} onImport={(rows) => result} />
 *     → "Download Format" (CSV with the headers + example rows) and "Import CSV" (parses the picked file and
 *       hands the rows, keyed by header, to onImport). onImport returns { tone, text } to show, or nothing.
 */

const stamp = () => new Date().toISOString().slice(0, 10);
const plain = (v) => (v == null ? '' : typeof v === 'number' ? v : String(v));

// The PDF's built-in font only has Western characters: swap the few symbols this app uses for plain text.
const pdfText = (v) =>
  String(v ?? '')
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/[→➜]/g, '->')
    .replace(/[✔✓]/g, 'OK')
    .replace(/[✕✖]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '*')
    .replace(/·/g, '|')
    .replace(/[^\x00-\xFF]/g, '');

export async function downloadPdf({ title, filename, headers, rows, subtitle }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(pdfText(`Pawan Putra Tubes – ${title}`), 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(pdfText(`${subtitle ? subtitle + ' · ' : ''}${rows.length} row(s) · ${new Date().toLocaleString('en-IN')}`), 40, 56);
  autoTable(doc, {
    startY: 68,
    head: [headers.map(pdfText)],
    body: rows.map((r) => r.map(pdfText)),
    styles: { fontSize: headers.length > 12 ? 6.5 : 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
    didDrawPage: (d) => {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${doc.getNumberOfPages()}`, d.settings.margin.left, doc.internal.pageSize.getHeight() - 16);
    },
  });
  doc.save(`${filename}-${stamp()}.pdf`);
}

/** A button that opens a small menu of actions. items = [{ label, icon?, hint?, onClick, disabled? }]; icon = an <Ico> name. */
export function Dropdown({ label, icon, items, disabled }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false); // open the menu leftwards when the button is near the right edge
  const box = useRef(null);
  const toggle = () => {
    const r = box.current?.getBoundingClientRect();
    setAlignRight(!!r && r.left + 200 > window.innerWidth);
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="dd" ref={box}>
      <button type="button" className="btn" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {icon && <Ico name={icon} />}{label} <span className="dd-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="dd-menu" role="menu" style={alignRight ? { left: 'auto', right: 0 } : undefined}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} title={it.hint}
              onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Ico name={it.icon} />}{it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** "Export ▾" → PDF / CSV of exactly the rows and columns given. */
export function ExportButtons({ title, filename, columns, rows, subtitle }) {
  const [busy, setBusy] = useState(false);
  const headers = columns.map((c) => c[0]);
  const data = () => rows.map((r) => columns.map((c) => plain(c[1](r))));
  const pdf = async () => {
    setBusy(true);
    try { await downloadPdf({ title, filename, headers, rows: data(), subtitle }); }
    catch (e) { alert(`Could not make the PDF: ${e.message}`); }
    finally { setBusy(false); }
  };
  return (
    <Dropdown
      label={busy ? 'Exporting…' : 'Export'}
      icon="export"
      disabled={!rows.length || busy}
      items={[
        { label: 'PDF file', icon: 'pdf', hint: 'Download this list as PDF', onClick: pdf },
        { label: 'CSV file (Excel)', icon: 'csv', hint: 'Download this list as CSV – opens in Excel', onClick: () => downloadCsv(`${filename}-${stamp()}.csv`, headers, data()) },
      ]}
    />
  );
}

/**
 * "Import ▾" → Download Format / Upload CSV.
 *  format   = { filename, headers, sample, required } – the format file, and columns the upload must have; or
 *  onFormat = () => void – a page that builds its own format file (e.g. Inventory with today's stock).
 *  onImport = (rows) => void – rows of the uploaded CSV, keyed by header; or
 *  onFile   = (file) => void – a page that reads the file itself.
 */
export function ImportButtons({ format, onFormat, onImport, onFile }) {
  const ref = useRef(null);
  const pick = async (file) => {
    if (onFile) return onFile(file);
    try {
      const rows = parseCsv(await readFileText(file));
      const missing = format?.required?.filter((h) => rows.length && !(h in rows[0])) || [];
      if (!rows.length) return alert('The file has no rows.');
      if (missing.length) return alert(`Wrong format – column(s) missing: ${missing.join(', ')}. Use Import → Download Format.`);
      await onImport(rows);
    } catch (e) {
      alert(`Could not read the file: ${e.message}`);
    }
  };
  return (
    <>
      <Dropdown
        label="Import"
        icon="import"
        items={[
          { label: 'Download Format', icon: 'format', hint: 'CSV file with the right columns – fill it in Excel', onClick: () => (onFormat ? onFormat() : downloadCsv(format.filename, format.headers, format.sample || [])) },
          { label: 'Upload CSV', icon: 'upload', hint: 'Pick the filled CSV file', onClick: () => ref.current?.click() },
        ]}
      />
      <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; f && pick(f); }} />
    </>
  );
}

/** Small closable message line used after an import. */
export const ImportMsg = ({ msg, clear }) =>
  msg ? <div className={`alert ${msg.tone}`} onClick={clear} title="Click to close">{msg.text}</div> : null;
