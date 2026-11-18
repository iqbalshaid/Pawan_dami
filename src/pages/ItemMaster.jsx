import React, { useState } from 'react';
import Ico from '../components/Icon.jsx';
import { useStore } from '../store.jsx';
import { ITEM_CATEGORIES, blankItem, impactOf, itemErrors, nextSku } from '../data.js';
import { Empty, Field, Modal, PageHead } from '../components/ui.jsx';
import { ExportButtons, ImportButtons } from '../components/DataIO.jsx';
import { downloadCsv, parseCsv, readFileText } from '../components/csv.js';

// CSV columns for Products import / template (header → field).
const CSV_COLS = [
  ['Name', 'name'], ['SKU', 'code'], ['Unit', 'uom'], ['Price', 'rate'], ['Item/Service', 'kind'], ['Item Type', 'category'],
  ['Group Head', 'groupHead'], ['Opening Qty', 'openingStock'], ['MOQ', 'moq'], ['Safety Stock', 'minStock'], ['Max Level', 'maxStock'],
  ['Suppliers', 'vendorIds'], ['Size', 'size'], ['Grade', 'grade'], ['HSN', 'hsn'], ['GST %', 'gstPct'], ['Location', 'location'],
];
// Sales products start as Finished Goods, Purchase products as Raw Material.
const newItem = (use) => ({ ...blankItem(), use, category: use === 'purchase' ? 'Raw Material' : 'Finished Goods' });
const num = (v) => (v === '' || v == null ? '' : Number(v));
const lc = (s) => String(s || '').trim().toLowerCase();

/** Master → Products: Sales products (what we sell) and Purchase products (what we buy) as tabs, with reorder levels. */
export default function ItemMaster() {
  const { state, user, updateRow, deleteRow, addRows } = useStore();
  const [q, setQ] = useState('');
  const [use, setUse] = useState('sales'); // tab: 'sales' | 'purchase'
  const [type, setType] = useState(''); // Item Type filter ('' = all)
  const purchase = use === 'purchase';
  const [edit, setEdit] = useState(null); // null | 'new' | item id
  const [heads, setHeads] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text } after import / blocked delete
  if (user.role !== 'admin') return <div className="alert">Only the admin can view the Products page.</div>;

  const items = state.items || [];
  const vendorName = (id) => state.vendors?.find((v) => v.id === id)?.name;
  const headName = (id) => state.groupHeads?.find((g) => g.id === id)?.name;
  const rows = items
    .filter((x) => x.use === use)
    .filter((x) => !type || x.category === type)
    .filter((x) => !q || [x.code, x.name, x.size, x.grade, x.category, x.hsn, headName(x.groupHead)].join(' ').toLowerCase().includes(q.toLowerCase()));

  const remove = (x) => {
    const used = impactOf('items', x, state);
    if (used.length) return setMsg({ tone: 'danger', text: `Cannot delete ${x.code} – ${x.name}: still used in ${used.join(', ')}. Make it inactive instead.` });
    if (confirm(`Delete product ${x.code} – ${x.name}?`)) { deleteRow('items', x.id); setMsg(null); }
  };

  const importCsv = async (file) => {
    const data = parseCsv(await readFileText(file));
    const added = [];
    const errors = [];
    data.forEach((r, i) => {
      const f = newItem(use);
      CSV_COLS.forEach(([h, k]) => { if (r[h] != null && r[h] !== '') f[k] = r[h]; });
      f.kind = lc(f.kind).startsWith('serv') ? 'service' : 'item';
      f.category = ITEM_CATEGORIES.find((c) => lc(c) === lc(f.category)) || 'Other';
      f.groupHead = state.groupHeads?.find((g) => lc(g.name) === lc(f.groupHead))?.id || '';
      f.vendorIds = purchase ? String(r.Suppliers || '').split(';').map((n) => state.vendors?.find((v) => v.type === 'Purchase' && lc(v.name) === lc(n))?.id).filter(Boolean) : [];
      f.uom = state.uoms?.find((u) => lc(u.abbr) === lc(f.uom) || lc(u.name) === lc(f.uom))?.abbr || f.uom;
      ['rate', 'openingStock', 'moq', 'minStock', 'maxStock'].forEach((k) => (f[k] = num(f[k])));
      f.gstPct = Number(f.gstPct) || 0;
      const pool = [...items, ...added];
      if (!String(f.code).trim()) f.code = nextSku(pool, f.category);
      f.code = String(f.code).trim().toUpperCase();
      const e = itemErrors(f, pool, null);
      if (Object.keys(e).length) errors.push(`Row ${i + 2}: ${Object.values(e).join(', ')}`);
      else added.push(f);
    });
    if (added.length) addRows('items', added);
    setMsg({
      tone: errors.length ? 'warn' : 'ok',
      text: `${added.length} product(s) imported.${errors.length ? ` ${errors.length} row(s) skipped – ${errors.slice(0, 5).join(' · ')}${errors.length > 5 ? ' …' : ''}` : ''}`,
    });
  };

  return (
    <>
      <PageHead
        title="Master · Products"
        sub={`${purchase ? 'Products we buy (raw material, packing…).' : 'Products we sell.'} SKU is made automatically when left blank (e.g. ${purchase ? 'RM-0001' : 'FG-0001'}). Opening Qty, MOQ, Safety Stock and Max Level drive the Inventory page. Name + size + grade must match what is written on ${purchase ? 'indents / unloading advices' : 'sales orders / loading advices'}.`}
        right={
          <>
            <button className="btn" onClick={() => setHeads(true)}><Ico name="group" />Group Heads</button>
            <ImportButtons
              onFormat={() => downloadCsv(`${use}-products-format.csv`, CSV_COLS.map((c) => c[0]), [purchase
                ? ['HR Coil', '', 'MT', '52000', 'Item', 'Raw Material', 'HR Coil', '150', '25', '300', '600', 'Godawari Ispat Ltd', '2.5 mm x 1250 mm', 'IS 10748', '7208', '18', 'RM Bay 1']
                : ['MS Square Tube', '', 'MT', '61500', 'Item', 'Finished Goods', 'MS Tubes', '50', '', '15', '80', '', '40x40x2.0 mm', 'YST-210', '7306', '18', 'FG Yard A']])}
              onFile={importCsv}
            />
            <ExportButtons
              title={`Products – ${purchase ? 'Purchase' : 'Sales'}`} filename={`products-${use}`} rows={rows}
              columns={[
                ['SKU', (x) => x.code], ['Name', (x) => x.name], ['Size', (x) => x.size], ['Grade', (x) => x.grade], ['Item Type', (x) => x.category],
                ['Group Head', (x) => headName(x.groupHead) || ''], ['Unit', (x) => x.uom], ['Price', (x) => x.rate], ['HSN', (x) => x.hsn], ['GST %', (x) => x.gstPct],
                ['Opening Qty', (x) => x.openingStock], ['MOQ', (x) => x.moq], ['Safety Stock', (x) => x.minStock], ['Max Level', (x) => x.maxStock],
                ...(purchase ? [['Suppliers', (x) => (x.vendorIds || []).map(vendorName).filter(Boolean).join('; ')]] : []),
                ['Location', (x) => x.location], ['Active', (x) => (x.active ? 'Yes' : 'No')],
              ]}
            />
            <button className="btn primary" onClick={() => setEdit('new')}><Ico name="add" />Add Product</button>
          </>
        }
      />
      {msg && <div className={`alert ${msg.tone}`} onClick={() => setMsg(null)} title="Click to close">{msg.text}</div>}
      <div className="tabs">
        {[['sales', 'Sales Products'], ['purchase', 'Purchase Products']].map(([k, l]) => (
          <button key={k} className={use === k ? 'on' : ''} onClick={() => { setUse(k); setType(''); setMsg(null); }}>{l}<i>{items.filter((x) => x.use === k).length}</i></button>
        ))}
      </div>
      <div className="card">
        <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Search SKU / name / size / grade / group head / HSN…" value={q} onChange={(e) => setQ(e.target.value)} />
          {/* Item Type filter – each type shows how many products of this tab it has */}
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 240 }} aria-label="Item Type">
            <option value="">All Item Types</option>
            {ITEM_CATEGORIES.map((c) => {
              const n = items.filter((x) => x.use === use && x.category === c).length;
              return <option key={c} value={c}>{c} ({n})</option>;
            })}
          </select>
        </div>
        {rows.length === 0 ? <Empty text="No products." /> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th><th>Name</th><th>Size / Grade</th><th>Item Type</th><th>Group Head</th><th>Unit</th><th>Price (₹)</th>
                <th>Opening Qty</th><th>MOQ</th><th>Safety Stock</th><th>Max Level</th>{purchase && <th>Suppliers</th>}<th>Active</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} style={x.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{x.code}</b>{x.kind === 'service' && <div className="muted">Service</div>}</td>
                  <td>{x.name}</td><td>{x.size}{x.grade && <div className="muted">{x.grade}</div>}</td>
                  <td>{x.category}</td><td>{headName(x.groupHead) || '—'}</td>
                  <td>{x.uom}</td><td>{x.rate ? Number(x.rate).toLocaleString('en-IN') : '—'}</td>
                  <td>{x.openingStock || 0}</td><td>{x.moq || '—'}</td><td>{x.minStock || '—'}</td><td>{x.maxStock || '—'}</td>
                  {purchase && <td className="clip">{(x.vendorIds || []).map(vendorName).filter(Boolean).join(', ') || '—'}</td>}
                  <td><input type="checkbox" checked={!!x.active} onChange={(e) => updateRow('items', x.id, { active: e.target.checked })} /></td>
                  <td className="acts">
                    <button className="btn sm" onClick={() => setEdit(x.id)}><Ico name="edit" />Edit</button>
                    <button className="btn sm danger" onClick={() => remove(x)}><Ico name="delete" />Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <ItemModal use={use} item={edit === 'new' ? null : items.find((x) => x.id === edit)} onClose={() => setEdit(null)} />}
      {heads && <GroupHeadsModal onClose={() => setHeads(false)} />}
    </>
  );
}

function ItemModal({ use, item, onClose }) {
  const { state, addRows, updateRow } = useStore();
  const items = state.items || [];
  const purchase = use === 'purchase';
  const [f, setF] = useState(item ? { ...blankItem(), ...item } : newItem(use));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const err = itemErrors(f, items, item?.id);
  const autoSku = nextSku(items, f.category);
  const vendors = (state.vendors || []).filter((v) => v.type === 'Purchase');
  const toggleVendor = (id) => set('vendorIds', f.vendorIds.includes(id) ? f.vendorIds.filter((x) => x !== id) : [...f.vendorIds, id]);
  const save = () => {
    const data = {
      ...f, use, vendorIds: purchase ? f.vendorIds : [], code: (f.code.trim() || autoSku).toUpperCase(), name: f.name.trim(), size: f.size.trim(), grade: f.grade.trim(),
      gstPct: Number(f.gstPct) || 0, rate: num(f.rate), openingStock: num(f.openingStock), moq: num(f.moq), minStock: num(f.minStock), maxStock: num(f.maxStock),
    };
    item ? updateRow('items', item.id, data) : addRows('items', [data]);
    onClose();
  };
  const I = (label, k, props = {}, span = 1) => (
    <Field label={label} span={span} hint={err[k]}><input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></Field>
  );
  const S = (label, k, options, hint) => (
    <Field label={label} hint={err[k] || hint}>
      <select value={f[k]} onChange={(e) => set(k, e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
  return (
    <Modal title={item ? `Edit ${purchase ? 'Purchase' : 'Sales'} Product – ${item.code}` : `Add ${purchase ? 'Purchase' : 'Sales'} Product`} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={Object.keys(err).length > 0} onClick={save}>Save Product</button></>}>
      <h4>1. Product Details</h4>
      <div className="form-grid">
        {I('Name * (2–100 characters)', 'name', { placeholder: 'e.g. MS Square Tube', maxLength: 100 })}
        <Field label="SKU" hint={err.code || `Leave blank for auto: ${autoSku}`}>
          <input value={f.code} placeholder={autoSku} onChange={(e) => set('code', e.target.value)} />
        </Field>
        {S('Item / Service', 'kind', [['item', 'Item'], ['service', 'Service']])}
        {S('Item Type', 'category', ITEM_CATEGORIES.map((c) => [c, c]))}
        {S('Group Head', 'groupHead', [['', '— None —'], ...(state.groupHeads || []).map((g) => [g.id, g.name])], 'Add more from "Group Heads" on the Products page')}
        {I('Size / Specification', 'size', { placeholder: 'e.g. 40x40x2.0 mm' })}
        {I('Grade', 'grade', { placeholder: 'e.g. YST-210' })}
      </div>
      <h4>2. Unit, Price & Tax</h4>
      <div className="form-grid">
        {S('Unit *', 'uom', (state.uoms || []).map((u) => [u.abbr, `${u.abbr} – ${u.name}`]), 'Units come from Master → UOM')}
        {I(`Price (₹ / ${f.uom})`, 'rate', { type: 'number', min: 0 })}
        {I('HSN Code', 'hsn')}
        {I('GST %', 'gstPct', { type: 'number', min: 0 })}
      </div>
      <h4>3. Stock & Reorder Levels</h4>
      <div className="form-grid">
        {I(`Opening Qty (${f.uom})`, 'openingStock', { type: 'number', min: 0, step: '0.001' })}
        {I(`MOQ – minimum order qty (${f.uom})`, 'moq', { type: 'number', min: 0, step: '0.001' })}
        {I(`Safety Stock – reorder level (${f.uom})`, 'minStock', { type: 'number', min: 0, step: '0.001' })}
        {I(`Max Level (${f.uom})`, 'maxStock', { type: 'number', min: 0, step: '0.001' })}
        {I('Store / Yard Location', 'location', { placeholder: 'e.g. FG Yard A' })}
        <Field label="Active">
          <select value={f.active ? 'yes' : 'no'} onChange={(e) => set('active', e.target.value === 'yes')}>
            <option value="yes">Yes – show on Inventory</option>
            <option value="no">No – hidden</option>
          </select>
        </Field>
      </div>
      {purchase && (
        <>
          <h4>4. Suppliers (who we buy this from)</h4>
          {vendors.length === 0 ? <p className="muted">No suppliers yet – add them in Master → Vendors (Suppliers tab).</p> : (
            <div className="checks">
              {vendors.map((v) => (
                <label key={v.id}><input type="checkbox" checked={f.vendorIds.includes(v.id)} onChange={() => toggleVendor(v.id)} /> {v.name}</label>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** Product group heads – add / delete (delete is blocked while a product uses it). */
function GroupHeadsModal({ onClose }) {
  const { state, addRows, deleteRow } = useStore();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const list = state.groupHeads || [];
  const dup = list.some((g) => lc(g.name) === lc(name));
  return (
    <Modal title="Product Group Heads" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="form-grid">
        <Field label="New Group Head" hint={dup ? 'Already exists' : ''}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MS Pipes" /></Field>
        <Field label="&nbsp;"><button className="btn primary" disabled={!name.trim() || dup} onClick={() => { addRows('groupHeads', [{ name: name.trim() }]); setName(''); }}><Ico name="add" />Add</button></Field>
      </div>
      {msg && <div className="alert danger">{msg}</div>}
      <table className="tbl mini">
        <thead><tr><th>Group Head</th><th>Products</th><th /></tr></thead>
        <tbody>
          {list.map((g) => {
            const used = impactOf('groupHeads', g, state);
            return (
              <tr key={g.id}>
                <td>{g.name}</td><td>{used[0] || '—'}</td>
                <td><button className="btn sm danger" onClick={() => (used.length ? setMsg(`Cannot delete "${g.name}" – used by ${used.join(', ')}.`) : (deleteRow('groupHeads', g.id), setMsg('')))}><Ico name="delete" />Delete</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
