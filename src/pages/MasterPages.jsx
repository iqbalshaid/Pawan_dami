import React, { useRef, useState } from 'react';
import Ico from '../components/Icon.jsx';
import { useStore } from '../store.jsx';
import { PARTY_LABEL, blankUom, blankVendor, impactOf, vendorErrors } from '../data.js';
import { Empty, Field, Modal, PageHead } from '../components/ui.jsx';
import { downloadCsv, parseCsv, readFileText } from '../components/csv.js';
import { ExportButtons, ImportButtons } from '../components/DataIO.jsx';

const lc = (s) => String(s || '').trim().toLowerCase();
const AdminOnly = ({ user, children }) => (user.role === 'admin' ? children : <div className="alert">Only the admin can view this Master page.</div>);
const Msg = ({ msg, clear }) => msg && <div className={`alert ${msg.tone}`} onClick={clear} title="Click to close">{msg.text}</div>;

/* ═══════════ UOM: Name, abbreviation, description – add, edit, delete ═══════════ */
export function UomPage() {
  const { state, user, addRows, updateRow, deleteRow } = useStore();
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = state.uoms || [];
  const remove = (u) => {
    const used = impactOf('uoms', u, state);
    if (used.length) return setMsg({ tone: 'danger', text: `Cannot delete ${u.abbr}: used by ${used.join(', ')}.` });
    if (confirm(`Delete unit ${u.abbr}?`)) { deleteRow('uoms', u.id); setMsg(null); }
  };
  return (
    <AdminOnly user={user}>
      <PageHead
        title="Master · UOM" sub="Units of measure used by Products (e.g. MT, Kg, Nos)."
        right={
          <>
            <ImportButtons
              format={{ filename: 'uom-format.csv', required: ['Name', 'Abbreviation'], headers: ['Name', 'Abbreviation', 'Description'], sample: [['Metric Ton', 'MT', 'Steel – 1000 kg']] }}
              onImport={(rows) => {
                const added = [];
                const errors = [];
                rows.forEach((r, i) => {
                  const d = { name: String(r.Name || '').trim(), abbr: String(r.Abbreviation || '').trim(), description: String(r.Description || '').trim() };
                  if (!d.name || !d.abbr) errors.push(`Row ${i + 2}: Name and Abbreviation are required`);
                  else if ([...list, ...added].some((u) => lc(u.abbr) === lc(d.abbr))) errors.push(`Row ${i + 2}: ${d.abbr} already exists`);
                  else added.push(d);
                });
                if (added.length) addRows('uoms', added);
                setMsg({ tone: errors.length ? 'warn' : 'ok', text: `${added.length} unit(s) imported.${errors.length ? ` ${errors.length} skipped – ${errors.slice(0, 5).join(' · ')}` : ''}` });
              }}
            />
            <ExportButtons title="UOM" filename="uom" rows={list} columns={[['Name', (u) => u.name], ['Abbreviation', (u) => u.abbr], ['Description', (u) => u.description]]} />
            <button className="btn primary" onClick={() => setEdit('new')}><Ico name="add" />Add Unit</button>
          </>
        }
      />
      <Msg msg={msg} clear={() => setMsg(null)} />
      <div className="card">
        {list.length === 0 ? <Empty text="No units." /> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Abbreviation</th><th>Description</th><th>Used by</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td><b>{u.abbr}</b></td><td>{u.description || '—'}</td><td>{impactOf('uoms', u, state)[0] || '—'}</td>
                  <td className="acts"><button className="btn sm" onClick={() => setEdit(u.id)}><Ico name="edit" />Edit</button><button className="btn sm danger" onClick={() => remove(u)}><Ico name="delete" />Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <UomModal uom={edit === 'new' ? null : list.find((u) => u.id === edit)} list={list} onClose={() => setEdit(null)}
          onSave={(d, old) => (old ? updateRow('uoms', old.id, d) : addRows('uoms', [d]))} />
      )}
    </AdminOnly>
  );
}

function UomModal({ uom, list, onClose, onSave }) {
  const { state, updateRow } = useStore();
  const [f, setF] = useState(uom || blankUom());
  const dup = list.some((u) => u.id !== uom?.id && lc(u.abbr) === lc(f.abbr));
  const valid = f.name.trim() && f.abbr.trim() && !dup;
  const save = () => {
    const d = { name: f.name.trim(), abbr: f.abbr.trim(), description: f.description.trim() };
    // Renaming an abbreviation carries the products that use it along.
    if (uom && uom.abbr !== d.abbr) (state.items || []).filter((x) => x.uom === uom.abbr).forEach((x) => updateRow('items', x.id, { uom: d.abbr }));
    onSave(d, uom);
    onClose();
  };
  return (
    <Modal title={uom ? `Edit Unit – ${uom.abbr}` : 'Add Unit'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Metric Ton" /></Field>
        <Field label="Abbreviation *" hint={dup ? 'Already used' : ''}><input value={f.abbr} onChange={(e) => setF({ ...f, abbr: e.target.value })} placeholder="e.g. MT" /></Field>
        <Field label="Description" span={2}><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ═══════════ Customers (Sales) / Suppliers (Purchase) – doc "Vendors":
   Name, Address, Mobile, Contact, GST, PAN, email, state, TDS, contact persons ═══════════ */
const VENDOR_CSV = [
  ['Name', 'name'], ['Address', 'address'], ['Mobile', 'mobile'], ['Contact Name', 'contactName'],
  ['GST', 'gst'], ['PAN', 'pan'], ['Email', 'email'], ['State', 'state'], ['TDS', 'tds'],
];

/** Master → Vendors: Customers (type 'Sales') and Suppliers (type 'Purchase') as tabs. */
export function VendorsPage() {
  const { state, user, addRows, deleteRow } = useStore();
  const [type, setType] = useState('Sales');
  const label = PARTY_LABEL[type];
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = state.vendors || [];
  const rows = list
    .filter((v) => v.type === type)
    .filter((v) => !q || [v.name, v.contactName, v.mobile, v.gst, v.state].join(' ').toLowerCase().includes(q.toLowerCase()));

  const remove = (v) => {
    const used = impactOf('vendors', v, state);
    if (used.length) return setMsg({ tone: 'danger', text: `Cannot delete ${v.name}: still used in ${used.join(', ')}.` });
    if (confirm(`Delete ${label.toLowerCase()} ${v.name}?`)) { deleteRow('vendors', v.id); setMsg(null); }
  };
  const importCsv = async (file) => {
    const data = parseCsv(await readFileText(file));
    const added = [];
    const errors = [];
    data.forEach((r, i) => {
      const f = blankVendor(type);
      VENDOR_CSV.forEach(([h, k]) => { if (r[h]) f[k] = r[h]; });
      f.tds = lc(f.tds) === 'yes' ? 'Yes' : 'No';
      f.gst = f.gst.toUpperCase();
      f.pan = f.pan.toUpperCase();
      const e = vendorErrors(f);
      if ([...list, ...added].some((v) => v.type === type && lc(v.name) === lc(f.name))) e.name = 'Name already exists';
      if (Object.keys(e).length) errors.push(`Row ${i + 2}: ${Object.values(e).join(', ')}`);
      else added.push(f);
    });
    if (added.length) addRows('vendors', added);
    setMsg({ tone: errors.length ? 'warn' : 'ok', text: `${added.length} ${label.toLowerCase()}(s) imported.${errors.length ? ` ${errors.length} row(s) skipped – ${errors.slice(0, 5).join(' · ')}` : ''}` });
  };

  return (
    <AdminOnly user={user}>
      <PageHead
        title="Master · Vendors"
        sub={type === 'Sales'
          ? 'Customers we sell to – picked as the party on Sales Orders and Loading Advices.'
          : 'Suppliers we buy from – linked to Purchase Products and picked as the PO / Unloading Advice supplier.'}
        right={
          <>
            <ImportButtons
              onFormat={() => downloadCsv(`${label.toLowerCase()}s-format.csv`, VENDOR_CSV.map((c) => c[0]), [['ABC Steels', 'Urla, Raipur', '9876543210', 'Ramesh', '22ABCDE1234F1Z5', 'ABCDE1234F', 'abc@example.com', 'Chhattisgarh', 'No']])}
              onFile={importCsv}
            />
            <ExportButtons
              title={`${label}s`} filename={`${label.toLowerCase()}s`} rows={rows}
              columns={[
                ['Name', (v) => v.name], ['Address', (v) => v.address], ['Mobile', (v) => v.mobile], ['Contact Name', (v) => v.contactName], ['GST', (v) => v.gst],
                ['PAN', (v) => v.pan], ['Email', (v) => v.email], ['State', (v) => v.state], ['TDS', (v) => v.tds],
                ['Contact Persons', (v) => (v.contacts || []).map((c) => [c.name, c.mobile].filter(Boolean).join(' ')).join('; ')],
              ]}
            />
            <button className="btn primary" onClick={() => setEdit('new')}><Ico name="add" />Add {label}</button>
          </>
        }
      />
      <Msg msg={msg} clear={() => setMsg(null)} />
      <div className="tabs">
        {[['Sales', 'Customers (Sales)'], ['Purchase', 'Suppliers (Purchase)']].map(([k, l]) => (
          <button key={k} className={type === k ? 'on' : ''} onClick={() => { setType(k); setMsg(null); }}>{l}<i>{list.filter((v) => v.type === k).length}</i></button>
        ))}
      </div>
      <div className="card">
        <div className="toolbar"><input placeholder="Search name / contact / mobile / GST / state…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {rows.length === 0 ? <Empty text={`No ${label.toLowerCase()}s.`} /> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Contact</th><th>Mobile</th><th>GST</th><th>PAN</th><th>Email</th><th>State</th><th>TDS</th>{type === 'Purchase' && <th>Products</th>}<th /></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.name}</b><div className="muted clip">{v.address}</div></td>
                  <td>{v.contactName || '—'}{v.contacts?.length > 0 && <div className="muted">+{v.contacts.length} more</div>}</td>
                  <td>{v.mobile || '—'}</td><td>{v.gst || '—'}</td><td>{v.pan || '—'}</td><td>{v.email || '—'}</td><td>{v.state || '—'}</td><td>{v.tds}</td>
                  {type === 'Purchase' && <td>{(state.items || []).filter((x) => x.vendorIds?.includes(v.id)).length || '—'}</td>}
                  <td className="acts"><button className="btn sm" onClick={() => setEdit(v.id)}><Ico name="edit" />Edit</button><button className="btn sm danger" onClick={() => remove(v)}><Ico name="delete" />Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <VendorModal type={type} vendor={edit === 'new' ? null : list.find((v) => v.id === edit)} onClose={() => setEdit(null)} />}
    </AdminOnly>
  );
}

function VendorModal({ type, vendor, onClose }) {
  const { state, addRows, updateRow } = useStore();
  const label = PARTY_LABEL[type];
  const [f, setF] = useState(vendor ? { ...blankVendor(type), ...vendor } : blankVendor(type));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const err = vendorErrors(f);
  if ((state.vendors || []).some((v) => v.id !== vendor?.id && v.type === type && lc(v.name) === lc(f.name))) err.name = `A ${label.toLowerCase()} with this name already exists`;
  const setContact = (i, k, v) => set('contacts', f.contacts.map((c, x) => (x === i ? { ...c, [k]: v } : c)));
  const save = () => {
    const d = { ...f, type, name: f.name.trim(), gst: f.gst.trim().toUpperCase(), pan: f.pan.trim().toUpperCase(), contacts: f.contacts.filter((c) => c.name.trim()) };
    vendor ? updateRow('vendors', vendor.id, d) : addRows('vendors', [d]);
    onClose();
  };
  const I = (label, k, props = {}, span = 1) => (
    <Field label={label} span={span} hint={err[k]}><input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></Field>
  );
  return (
    <Modal title={vendor ? `Edit ${label} – ${vendor.name}` : `Add ${label}`} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={Object.keys(err).length > 0} onClick={save}>Save {label}</button></>}>
      <div className="form-grid">
        {I(`${label} Name *`, 'name')}
        {I('Address', 'address', {}, 2)}
        {I('Mobile (10 digits)', 'mobile', { inputMode: 'numeric', maxLength: 10 })}
        {I('Contact Name', 'contactName')}
        {I('GST (15 characters)', 'gst', { maxLength: 15 })}
        {I('PAN (10 characters)', 'pan', { maxLength: 10 })}
        {I('Email', 'email', { type: 'email' })}
        {I('State', 'state')}
        <Field label="TDS">
          <select value={f.tds} onChange={(e) => set('tds', e.target.value)}><option>No</option><option>Yes</option></select>
        </Field>
      </div>
      <h4>Contact Persons</h4>
      {f.contacts.length > 0 && (
        <table className="tbl mini">
          <thead><tr><th>Name *</th><th>Designation</th><th>Mobile</th><th>Email</th><th /></tr></thead>
          <tbody>
            {f.contacts.map((c, i) => (
              <tr key={i}>
                {['name', 'designation', 'mobile', 'email'].map((k) => <td key={k}><input value={c[k]} onChange={(e) => setContact(i, k, e.target.value)} /></td>)}
                <td><button className="icon-btn" onClick={() => set('contacts', f.contacts.filter((_, x) => x !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn sm" onClick={() => set('contacts', [...f.contacts, { name: '', designation: '', mobile: '', email: '' }])}><Ico name="add" />Add contact person</button>
    </Modal>
  );
}

/* ═══════════ Payment Terms: Value (text) – add and delete only (no edit) ═══════════ */
export function PaymentTermsPage() {
  const { state, user, addRows, deleteRow } = useStore();
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState(null);
  const list = state.paymentTerms || [];
  const dup = list.some((p) => lc(p.value) === lc(value));
  const usedBy = (p) => (state.orders || []).filter((o) => lc(o.paymentTerms) === lc(p.value)).length;
  return (
    <AdminOnly user={user}>
      <PageHead
        title="Master · Payment Terms" sub="Commercial terms and credit days, picked on the Sales Order. Terms can only be added or deleted (no edit)."
        right={
          <>
            <ImportButtons
              format={{ filename: 'payment-terms-format.csv', required: ['Value'], headers: ['Value'], sample: [['60 days credit'], ['50% advance, 50% on delivery']] }}
              onImport={(rows) => {
                const added = [];
                const skipped = [];
                rows.forEach((r) => {
                  const v = String(r.Value || '').trim();
                  if (!v || [...list, ...added].some((p) => lc(p.value) === lc(v))) skipped.push(v || '(blank)');
                  else added.push({ value: v });
                });
                if (added.length) addRows('paymentTerms', added);
                setMsg({ tone: skipped.length ? 'warn' : 'ok', text: `${added.length} payment term(s) imported.${skipped.length ? ` ${skipped.length} skipped (blank or already exists).` : ''}` });
              }}
            />
            <ExportButtons title="Payment Terms" filename="payment-terms" rows={list} columns={[['Value', (p) => p.value], ['Used on Sales Orders', usedBy]]} />
          </>
        }
      />
      <Msg msg={msg} clear={() => setMsg(null)} />
      <div className="card">
        <div className="form-grid">
          <Field label="New Payment Term" hint={dup ? 'Already exists' : ''}><input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 60 days credit" /></Field>
          <Field label="&nbsp;"><button className="btn primary" disabled={!value.trim() || dup} onClick={() => { addRows('paymentTerms', [{ value: value.trim() }]); setValue(''); }}><Ico name="add" />Add</button></Field>
        </div>
        {list.length === 0 ? <Empty text="No payment terms." /> : (
          <table className="tbl">
            <thead><tr><th>Value</th><th>Used on Sales Orders</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.value}</b></td><td>{usedBy(p) || '—'}</td>
                  <td className="acts"><button className="btn sm danger" onClick={() => confirm(`Delete payment term "${p.value}"? Orders already saved keep their text.`) && deleteRow('paymentTerms', p.id)}><Ico name="delete" />Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminOnly>
  );
}
