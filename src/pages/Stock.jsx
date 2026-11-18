import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { ITEM_CATEGORIES, blankItem, itemErrors, nextSku, stockOf } from '../data.js';
import { Empty, PageHead } from '../components/ui.jsx';
import { ExportButtons, ImportButtons } from '../components/DataIO.jsx';
import { Kpi } from './Dashboard.jsx';
import { downloadCsv, parseCsv, readFileText } from '../components/csv.js';

// Inventory import format. "Current Stock" = physical stock today; the product's Opening Qty is worked back
// from it (Current Stock − received + dispatched) so In Stock on this page shows exactly that number.
const IMPORT_COLS = ['SKU', 'Name', 'Size', 'Grade', 'Item Type', 'Unit', 'Current Stock', 'MOQ', 'Safety Stock', 'Max Level', 'Location'];
const lc = (v) => String(v || '').trim().toLowerCase();
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Turn uploaded rows into product updates / new products for one tab ('sales' | 'purchase').
 * A row with a known SKU updates that product (blank cells keep the old value); a row with no / unknown SKU
 * but a Name adds a new product (SKU made automatically when blank). Returns { updates, added, errors }.
 */
export function planImport(rows, use, state) {
  const items = state.items || [];
  const updates = [];
  const added = [];
  const errors = [];
  const numOf = (r, col, i, errs) => {
    const v = String(r[col] ?? '').replace(/,/g, '').trim();
    if (v === '') return undefined;
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) { errs.push(`${col} must be a number ≥ 0`); return undefined; }
    return x;
  };
  rows.forEach((r, i) => {
    const errs = [];
    const sku = String(r.SKU || '').trim().toUpperCase();
    const found = sku && items.find((x) => x.code.toUpperCase() === sku);
    if (found && found.use !== use) errs.push(`${sku} is a ${found.use === 'purchase' ? 'Purchase' : 'Sales'} product – import it on that tab`);
    const cur = numOf(r, 'Current Stock', i, errs);
    const nums = { moq: numOf(r, 'MOQ', i, errs), minStock: numOf(r, 'Safety Stock', i, errs), maxStock: numOf(r, 'Max Level', i, errs) };
    const typeCell = String(r['Item Type'] || '').trim();
    const category = typeCell ? ITEM_CATEGORIES.find((c) => lc(c) === lc(typeCell)) : undefined;
    if (typeCell && !category) errs.push(`Item Type "${typeCell}" is not valid (${ITEM_CATEGORIES.join(' / ')})`);
    const unitCell = String(r.Unit || '').trim();
    const uom = unitCell ? (state.uoms || []).find((u) => lc(u.abbr) === lc(unitCell) || lc(u.name) === lc(unitCell))?.abbr : undefined;
    if (unitCell && !uom) errs.push(`Unit "${unitCell}" is not in Master → UOM`);
    if (!found && !String(r.Name || '').trim()) errs.push(sku ? `SKU ${sku} not found and no Name given to add it` : 'SKU or Name is required');

    const base = found ? { ...blankItem(), ...found } : { ...blankItem(), use, category: use === 'purchase' ? 'Raw Material' : 'Finished Goods' };
    const next = { ...base };
    ['Name', 'Size', 'Grade', 'Location'].forEach((col) => {
      const v = String(r[col] ?? '').trim();
      if (v) next[{ Name: 'name', Size: 'size', Grade: 'grade', Location: 'location' }[col]] = v;
    });
    if (category) next.category = category;
    if (uom) next.uom = uom;
    Object.entries(nums).forEach(([k, v]) => { if (v !== undefined) next[k] = v; });
    if (!found) next.code = sku || nextSku([...items, ...added], next.category);
    if (cur !== undefined) {
      // Opening Qty that makes In Stock = Current Stock, given this product's truck movements so far.
      const moved = stockOf({ ...next, openingStock: 0 }, state.advices).inStock;
      next.openingStock = r3(cur - moved);
    }
    const e = itemErrors(next, [...items, ...added], found?.id);
    if (!errs.length) errs.push(...Object.values(e)); // only when the row has no earlier problem, to avoid repeats
    if (errs.length) errors.push(`Row ${i + 2}${sku ? ` (${sku})` : ''}: ${errs.join(', ')}`);
    else if (found) updates.push({ id: found.id, patch: next });
    else added.push(next);
  });
  return { updates, added, errors };
}

const TONE = { OK: 'green', 'Low stock': 'amber', 'Out of stock': 'red', 'Purchase needed': 'red' };
const n = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

/**
 * Inventory (sidebar, under Dashboard): stock of every active product from Master → Products, worked out from
 * opening qty + purchase GRNs − sales Gate-Outs. Sales tab = what we can sell, Purchase tab = what we must buy
 * (Safety Stock / Max Level / MOQ).
 */
export default function StockPage() {
  const { state, user, addRows, updateRow } = useStore();
  const [msg, setMsg] = useState(null); // { tone, text } after an import
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState('sales');
  const [q, setQ] = useState('');
  const [head, setHead] = useState('');
  const items = (state.items || []).filter((x) => x.active && x.kind !== 'service');
  const stock = (x) => stockOf(x, state.advices);
  const inTab = (x, t) => x.use === t;
  const headName = (id) => state.groupHeads?.find((g) => g.id === id)?.name;
  const vendorNames = (x) => (x.vendorIds || []).map((id) => state.vendors?.find((v) => v.id === id)?.name).filter(Boolean);
  const rows = items
    .filter((x) => inTab(x, tab))
    .filter((x) => !head || x.groupHead === head)
    .filter((x) => !q || [x.code, x.name, x.size, x.grade].join(' ').toLowerCase().includes(q.toLowerCase()))
    .map((x) => ({ ...x, s: stock(x) }));

  const salesRows = items.filter((x) => inTab(x, 'sales')).map(stock);
  const buyRows = items.filter((x) => inTab(x, 'purchase')).map(stock);
  const sellable = salesRows.filter((s) => s.available > 0).length;
  const lowSales = salesRows.filter((s) => s.status !== 'OK').length;
  const toBuy = buyRows.filter((s) => s.status === 'Purchase needed').length;
  const incoming = buyRows.reduce((t, s) => t + s.incoming, 0);
  const purchase = tab === 'purchase';

  // CSV / PDF of the open tab, same columns as the table.
  const exportCols = [
    ['SKU', (x) => x.code], ['Name', (x) => x.name], ['Size', (x) => x.size], ['Grade', (x) => x.grade], ['Group Head', (x) => headName(x.groupHead) || ''],
    ['Unit', (x) => x.uom], ['Opening Qty', (x) => x.openingStock || 0], ['Received', (x) => x.s.received], ['Dispatched', (x) => x.s.dispatched], ['In Stock', (x) => x.s.inStock],
    purchase ? ['Incoming', (x) => x.s.incoming] : ['Reserved', (x) => x.s.reserved], ['Available', (x) => x.s.available],
    ['MOQ', (x) => x.moq || ''], ['Safety Stock', (x) => x.minStock || ''], ['Max Level', (x) => x.maxStock || ''],
    ...(purchase ? [['Suggested Purchase', (x) => x.s.toBuy || ''], ['Suppliers', (x) => vendorNames(x).join('; ')]] : []),
    ['Status', (x) => x.s.status],
  ];

  // Format = every product of this tab with today's stock, ready to edit and upload back.
  const downloadFormat = () => {
    const all = (state.items || []).filter((x) => x.use === tab && x.kind !== 'service');
    const data = all.map((x) => [x.code, x.name, x.size, x.grade, x.category, x.uom, stock(x).inStock, x.moq ?? '', x.minStock ?? '', x.maxStock ?? '', x.location || '']);
    downloadCsv(`inventory-import-${tab}.csv`, IMPORT_COLS, data);
  };

  const importFile = async (file) => {
    const rows = parseCsv(await readFileText(file));
    const missing = ['SKU', 'Current Stock'].filter((c) => rows.length && !(c in rows[0]));
    if (!rows.length || missing.length) {
      return setMsg({ tone: 'danger', text: rows.length ? `Wrong format – column(s) missing: ${missing.join(', ')}. Use Import → Download Format.` : 'The file has no rows.' });
    }
    const { updates, added, errors } = planImport(rows, tab, state);
    const what = `${updates.length} product(s) will be updated, ${added.length} new product(s) added${errors.length ? `, ${errors.length} row(s) skipped` : ''}.`;
    if (!updates.length && !added.length) return setMsg({ tone: 'danger', text: `Nothing imported. ${errors.slice(0, 5).join(' · ')}` });
    if (!confirm(`Import into ${purchase ? 'Purchase' : 'Sales'} items?\n\n${what}\n\nCurrent Stock replaces the stock shown here.`)) return;
    updates.forEach((u) => updateRow('items', u.id, u.patch));
    if (added.length) addRows('items', added);
    setMsg({
      tone: errors.length ? 'warn' : 'ok',
      text: `Imported: ${updates.length} updated, ${added.length} added.${errors.length ? ` Skipped – ${errors.slice(0, 5).join(' · ')}${errors.length > 5 ? ' …' : ''}` : ''}`,
    });
  };

  return (
    <>
      <PageHead
        title="Inventory"
        sub="Stock = Opening Qty + Purchase received (GRN done) − Sales dispatched (Gate-Out done). Available = Stock − qty already on sales advices in process. Products and reorder levels are set in Master → Products."
        right={
          <>
            {isAdmin && (
              <>
                <ImportButtons onFormat={downloadFormat} onFile={importFile} />
              </>
            )}
            <ExportButtons title={`Inventory – ${purchase ? 'Purchase' : 'Sales'} Items`} filename={`inventory-${tab}`} rows={rows} columns={exportCols} />
          </>
        }
      />
      {msg && <div className={`alert ${msg.tone}`} onClick={() => setMsg(null)} title="Click to close">{msg.text}</div>}
      {isAdmin && (
        <p className="muted">
          Import: click <b>Import → Download Format</b> (the {purchase ? 'Purchase' : 'Sales'} tab's products with today's stock), change <b>Current Stock</b>, MOQ, Safety Stock, Max Level or Location in Excel, save as CSV and use <b>Import → Upload CSV</b>.
          A new row with a Name and no SKU adds a new product. Blank cells keep the old value.
        </p>
      )}
      <div className="kpis">
        <Kpi icon="📦" label="Items available to sell" value={sellable} note={`of ${salesRows.length} sales items`} tone="green" />
        <Kpi icon="⚠️" label="Sales items low / out" value={lowSales} note="at or below safety stock" tone="amber" />
        <Kpi icon="🛒" label="Items to purchase" value={toBuy} note={`of ${buyRows.length} purchase items`} tone="blue" />
        <Kpi icon="🚚" label="Incoming (GRN pending)" value={n(incoming)} note="qty on purchase trucks" tone="gray" />
      </div>

      <div className="tabs">
        <button className={tab === 'sales' ? 'on' : ''} onClick={() => { setTab('sales'); setMsg(null); }}>Sales Items – what we can sell<i>{salesRows.length}</i></button>
        <button className={purchase ? 'on' : ''} onClick={() => { setTab('purchase'); setMsg(null); }}>Purchase Items – what we must buy<i>{buyRows.length}</i></button>
      </div>

      <div className="card">
        <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Search SKU / name / size / grade…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={head} onChange={(e) => setHead(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">All group heads</option>
            {(state.groupHeads || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <Empty text="No items. Add products in Master → Products." /> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th><th>Name</th><th>Size / Grade</th><th>Unit</th><th>Opening Qty</th>
                <th>Received (+)</th><th>Dispatched (−)</th><th>In Stock</th>
                {purchase ? <th>Incoming (GRN pending)</th> : <th>Reserved (on advices)</th>}
                <th>Available</th><th>MOQ</th><th>Safety Stock</th><th>Max Level</th>
                {purchase && <><th>Suggested Purchase</th><th>Suppliers</th></>}
                <th>Stock Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td><b>{x.code}</b></td>
                  <td>{x.name}<div className="muted">{headName(x.groupHead) || ''}</div></td>
                  <td>{x.size}{x.grade && <div className="muted">{x.grade}</div>}</td><td>{x.uom}</td>
                  <td>{n(x.openingStock)}</td><td>{n(x.s.received)}</td><td>{n(x.s.dispatched)}</td>
                  <td><b>{n(x.s.inStock)}</b></td>
                  {purchase ? <td>{n(x.s.incoming)}</td> : <td>{n(x.s.reserved)}</td>}
                  <td className={x.s.available <= 0 ? 'tone-red' : ''}><b>{n(x.s.available)}</b></td>
                  <td>{x.moq ? n(x.moq) : '—'}</td><td>{x.minStock ? n(x.minStock) : '—'}</td><td>{x.maxStock ? n(x.maxStock) : '—'}</td>
                  {purchase && (
                    <>
                      <td>{x.s.toBuy ? <b>{n(x.s.toBuy)} {x.uom}</b> : '—'}</td>
                      <td className="clip">{vendorNames(x).join(', ') || '—'}</td>
                    </>
                  )}
                  <td><span className={`badge ${TONE[x.s.status]}`}>{x.s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
