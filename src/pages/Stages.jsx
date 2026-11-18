import React, { useState } from 'react';
import Ico from '../components/Icon.jsx';
import StagePage from '../components/StagePage.jsx';
import { Field, PhotoInput, biltyOf, fmtDT, kg, loadedTotal, netOf, netText, plannedTotal } from '../components/ui.jsx';
import { GatePassSheet } from './Documents.jsx';
import { useStore } from '../store.jsx';
import { actOf, afterStage, exitTat, labelsFor, minText, nextDispatchNos, termsOf, termsText, userCan, weBearFreight } from '../data.js';

const nowISO = () => new Date().toISOString();

// Sales truck comes empty and leaves loaded; Purchase truck comes loaded and leaves empty.
// Either way net material = difference of the two weighments.
const weightName = (sub, which) =>
  sub === 'purchase'
    ? which === 'first' ? '1st Weight – Loaded vehicle' : 'Final Weight – Empty vehicle'
    : which === 'first' ? '1st Weight – Empty vehicle (tare)' : 'Final Weight – Loaded vehicle';
const rs = (v) => '₹ ' + Math.round(v || 0).toLocaleString('en-IN');

/** Dropdown of incharges who have action permission on this module (defaults to logged-in user). */
function useIncharge(sub, module) {
  const { state, user } = useStore();
  const list = state.users.filter((u) => userCan(state.users, u, `${sub}.${module}`, 'action')); // includes alternative users
  const [id, setId] = useState(list.find((u) => u.id === user.id)?.id || list[0]?.id || '');
  const name = list.find((u) => u.id === id)?.name || user.name;
  const field = (
    <div className="form-grid">
      <Field label="Incharge (person doing this step) *">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {list.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
    </div>
  );
  return [name, field];
}

function Checks({ items, state, setState }) {
  return (
    <div className="checks">
      {items.map((c) => (
        <label key={c}>
          <input type="checkbox" checked={!!state[c]} onChange={(e) => setState({ ...state, [c]: e.target.checked })} />
          {c}
        </label>
      ))}
    </div>
  );
}

/* ═══════════ 2. Verification (Security checking & vehicle entry) ═══════════ */
const GATE_IN_CHECKS = ['Vehicle Number', 'Transporter Name', 'Driver Details', 'Loading / Unloading Advice', 'Other required vehicle documents', 'Vehicle & driver security checking'];

// Things a driver commonly carries in – one tap adds a row; anything else can be typed in.
const COMMON_BELONGINGS = ['Mobile Phone', 'Tarpaulin', 'Rope', 'Tool Kit', 'Spare Tyre', 'Jack', 'Wooden Blocks / Patla', 'Chain', 'Bag / Personal Luggage', 'Cash'];
const blankBelonging = { item: '', qty: '1', remark: '' };

/** Editable list of the driver's own belongings taken inside the plant (Gate-In). */
function BelongingsInput({ rows, setRows }) {
  const setRow = (i, k, v) => setRows(rows.map((r, x) => (x === i ? { ...r, [k]: v } : r)));
  const add = (item = '') => setRows([...rows, { ...blankBelonging, item }]);
  return (
    <>
      <h4>Driver's Belongings (taken inside with the truck)</h4>
      <p className="muted">List what the driver brings in, so the same can be checked at Gate-Out. Leave empty if nothing.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {COMMON_BELONGINGS.filter((x) => !rows.some((r) => r.item === x)).map((x) => (
          <button key={x} type="button" className="btn sm" onClick={() => add(x)}>+ {x}</button>
        ))}
      </div>
      {rows.length > 0 && (
        <table className="tbl mini">
          <thead><tr><th>Item *</th><th>Qty</th><th>Remark (make / colour / ID)</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input value={r.item} placeholder="Item name" onChange={(e) => setRow(i, 'item', e.target.value)} /></td>
                <td><input type="number" min="1" value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} style={{ width: 70 }} /></td>
                <td><input value={r.remark} onChange={(e) => setRow(i, 'remark', e.target.value)} /></td>
                <td><button type="button" className="icon-btn" onClick={() => setRows(rows.filter((_, x) => x !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn sm" onClick={() => add()}><Ico name="add" />Add other item</button>
    </>
  );
}

/** Read-only table of the belongings recorded at Gate-In. */
function BelongingsTable({ a }) {
  const rows = a.gateIn?.belongings || [];
  if (!rows.length) return <p className="muted">No belongings recorded at Gate-In.</p>;
  return (
    <table className="tbl mini">
      <thead><tr><th>Item</th><th>Qty</th><th>Remark</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{r.item}</td><td>{r.qty}</td><td>{r.remark || '—'}</td></tr>)}</tbody>
    </table>
  );
}

function GateInForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'gatein');
  const [c, setC] = useState({});
  const [belongings, setBelongings] = useState([]);
  const belongingsOk = belongings.every((r) => r.item.trim());
  // Purchase: driver brings the supplier's bilty; only its number (+ photo) is recorded here.
  const [doc, setDoc] = useState({ biltyNo: '', biltyPhoto: '', invoiceNo: '', ewayBill: '' });
  const purchase = a.type === 'purchase';
  // LR matters most when the freight is ours (Ex-Works) – then it is mandatory, otherwise optional.
  const lrRequired = purchase && weBearFreight(a);
  const ok = GATE_IN_CHECKS.every((x) => c[x]) && (!lrRequired || doc.biltyNo.trim()) && belongingsOk;
  const set = (k) => (e) => setDoc({ ...doc, [k]: e.target.value });
  const save = () => {
    const d = purchase
      ? { biltyNo: doc.biltyNo.trim().toUpperCase(), biltyPhoto: doc.biltyPhoto, invoiceNo: doc.invoiceNo.trim(), ewayBill: doc.ewayBill.trim() }
      : {};
    const list = belongings.map((r) => ({ item: r.item.trim(), qty: Number(r.qty) || 1, remark: r.remark.trim() }));
    updateAdvice(a.id, { stage: 'GATED_IN', gateIn: { time: nowISO(), by: who, ...d, belongings: list } });
    done();
  };
  return (
    <>
      {purchase && (
        <>
          <h4>Supplier Bilty / Documents (brought by driver)</h4>
          <div className="form-grid">
            <Field label={`Bilty / LR No.${lrRequired ? ' *' : ''}`} hint={lrRequired ? 'Ex-Works – freight is ours, LR required' : 'FOR – supplier pays freight, LR optional'}>
              <input value={doc.biltyNo} onChange={set('biltyNo')} placeholder="Bilty number from driver" />
            </Field>
            <Field label="Bilty photo (optional)"><PhotoInput value={doc.biltyPhoto} onChange={(v) => setDoc((d) => ({ ...d, biltyPhoto: v }))} /></Field>
            <Field label="Supplier Invoice No."><input value={doc.invoiceNo} onChange={set('invoiceNo')} /></Field>
            <Field label="E-Way Bill No."><input value={doc.ewayBill} onChange={set('ewayBill')} /></Field>
          </div>
        </>
      )}
      <BelongingsInput rows={belongings} setRows={setBelongings} />
      {whoField}
      <h4>Security shall verify</h4>
      <Checks items={GATE_IN_CHECKS} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={save}>Record Gate-In → Send to Weighment</button>
    </>
  );
}

/** Read-only record once Gate-In is done – kept visible on every later stage. */
function GateInHistory({ a }) {
  if (!a.gateIn) return <div className="alert">Gate-In is not done for this truck yet.</div>;
  return (
    <>
      <h4>Gate-In History</h4>
      <table className="kvt"><tbody>
        <tr><th>Gate-In Time</th><td>{fmtDT(a.gateIn.time)} · {a.gateIn.by}</td></tr>
        {a.type === 'purchase' && (
          <>
            <tr><th>Supplier Bilty No.</th><td>{a.gateIn.biltyNo || '—'}</td></tr>
            <tr><th>Supplier Invoice No.</th><td>{a.gateIn.invoiceNo || '—'}</td></tr>
            <tr><th>E-Way Bill No.</th><td>{a.gateIn.ewayBill || '—'}</td></tr>
          </>
        )}
      </tbody></table>
      <h4>Driver's Belongings</h4>
      <BelongingsTable a={a} />
      {a.gateIn.biltyPhoto && (
        <>
          <h4>Bilty photo</h4>
          <img src={a.gateIn.biltyPhoto} alt="Bilty" style={{ maxWidth: 280, borderRadius: 6, border: '1px solid #e3e8ef' }} />
        </>
      )}
    </>
  );
}

export function VerificationPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="gatein" title="Gate In (Verification)" subtitle="Security checking & vehicle entry – Gate Incharge."
      tabs={[
        { key: 'in', label: 'Verification Pending', stages: ['CREATED'], title: 'Security Checking & Vehicle Entry', Form: GateInForm },
        { key: 'history', label: 'History', stages: afterStage('CREATED'), title: 'Gate-In History', Form: GateInHistory, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ 3 & 5. Weighment / Final Weighment ═══════════ */
function WeightForm({ a, sub, done, mode }) {
  const { updateAdvice } = useStore();
  const first = mode === 'first';
  const [who, whoField] = useIncharge(sub, first ? 'weighin' : 'weighout');
  const [method, setMethod] = useState('photo'); // 'photo' | 'manual'
  const [w, setW] = useState('');
  const [photo, setPhoto] = useState('');
  const [remark, setRemark] = useState('');
  const manual = method === 'manual';
  const tare = a.tare?.weight;
  const net = !first && manual && w && typeof tare === 'number' ? Math.abs(Number(w) - tare) : null;
  const planned = loadedTotal(a) * 1000; // compare with what was actually loaded (edited at Loading end)
  const valid = manual ? Number(w) > 0 && remark.trim() : !!photo;
  const submit = () => {
    const rec = manual
      ? { weight: Number(w), photo: '', remark: remark.trim(), method, time: nowISO(), by: who }
      : { weight: null, photo, remark: '', method, time: nowISO(), by: who };
    updateAdvice(a.id, first ? { stage: 'TARE_DONE', tare: rec } : { stage: 'FINAL_DONE', final: rec });
    done();
  };
  return (
    <>
      <h4>{weightName(a.type, first ? 'first' : 'final')}</h4>
      {whoField}
      {!first && <div className="muted">{weightName(a.type, 'first')}: <b>{a.tare?.method === 'photo' ? 'In slip photo' : kg(tare)}</b></div>}

      <div className="seg">
        <button type="button" className={!manual ? 'on' : ''} onClick={() => setMethod('photo')}>📷 Photo upload</button>
        <button type="button" className={manual ? 'on' : ''} onClick={() => setMethod('manual')}>✍ Manually</button>
      </div>

      {manual ? (
        <div className="form-grid">
          <Field label="Weight (kg) *"><input type="number" value={w} onChange={(e) => setW(e.target.value)} placeholder="Manual weight" /></Field>
          <Field label="Remark * (reason for manual entry)"><input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
        </div>
      ) : (
        <div className="form-grid">
          <Field label="Weighment slip photo *" span={2}><PhotoInput value={photo} onChange={setPhoto} /></Field>
        </div>
      )}

      {net != null && (
        <div className={`alert ${planned && Math.abs(net - planned) > planned * 0.02 ? 'warn' : 'ok'}`}>
          {a.type === 'purchase' ? 'Net material received' : 'Net weight'}: <b>{kg(net)}</b> {planned ? `· ${a.type === 'purchase' ? 'Ordered' : 'Planned'} ${kg(planned)}` : ''}
        </div>
      )}
      <button className="btn primary" disabled={!valid} onClick={submit}>
        {first ? 'Save → Send to Loading / Unloading Yard' : a.type === 'purchase' ? 'Save → Send to Material Receipt (GRN)' : 'Save → Send to Billing'}
      </button>
    </>
  );
}

/** Read-only record of a weighment – kept visible on every later stage. */
function WeightHistory({ a, mode }) {
  const r = mode === 'first' ? a.tare : a.final;
  if (!r) return <div className="alert">This weighment is not done yet.</div>;
  return (
    <>
      <h4>{weightName(a.type, mode)} – History</h4>
      <table className="kvt"><tbody>
        <tr><th>Method</th><td>{r.method === 'photo' ? 'Slip photo' : 'Manual entry'}</td></tr>
        <tr><th>Weight</th><td>{r.method === 'photo' ? 'In slip photo (see below)' : kg(r.weight)}</td></tr>
        <tr><th>Time</th><td>{fmtDT(r.time)} · {r.by}</td></tr>
        {r.remark && <tr><th>Remark</th><td>{r.remark}</td></tr>}
        {mode === 'final' && netOf(a) != null && <tr><th>Net Weight</th><td>{netText(a)}</td></tr>}
      </tbody></table>
      {r.photo && <img src={r.photo} alt="Weighment slip" style={{ maxWidth: 260, marginTop: 10, borderRadius: 6, border: '1px solid #e3e8ef' }} />}
      {mode === 'final' && <ReweighList a={a} />}
    </>
  );
}

export function WeighmentPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="weighin" title="Weighment"
      subtitle={`${weightName(sub, 'first')} – Weighbridge. Upload the slip photo or enter the weight manually.`}
      tabs={[
        { key: 'first', label: 'Weighment Pending', stages: ['GATED_IN'], title: 'First Weighment & Yard Movement', Form: (p) => <WeightForm {...p} mode="first" /> },
        { key: 'history', label: 'History', stages: afterStage('GATED_IN'), title: '1st Weighment History', Form: (p) => <WeightHistory {...p} mode="first" />, readOnly: true },
      ]}
    />
  );
}

/* ── Re-Weighment: truck stayed inside longer than the exit TAT after its final weighment ── */
function ReweighForm({ a, sub, done }) {
  const { updateAdvice, state } = useStore();
  const [who, whoField] = useIncharge(sub, 'weighout');
  const [method, setMethod] = useState('photo');
  const [w, setW] = useState('');
  const [photo, setPhoto] = useState('');
  const [remark, setRemark] = useState('');
  const manual = method === 'manual';
  const t = exitTat(a, state.settings);
  const prev = a.reweighs?.at(-1) || a.final; // the weighment the TAT ran from
  const diff = manual && w && typeof prev?.weight === 'number' ? Number(w) - prev.weight : null;
  const valid = manual ? Number(w) > 0 && remark.trim() : !!photo;
  const submit = () => {
    const rec = { weight: manual ? Number(w) : null, photo: manual ? '' : photo, remark: remark.trim(), method, time: nowISO(), by: who, lateMin: t?.overMin || 0 };
    updateAdvice(a.id, { reweighs: [...(a.reweighs || []), rec] });
    done();
  };
  return (
    <>
      {t?.late && (
        <div className="alert danger">
          Exit TAT crossed: <b>{minText(t.elapsedMin)}</b> since last weighment ({fmtDT(t.from)}) – limit {minText(t.limitMin)}, late by <b>{minText(t.overMin)}</b>. Weigh the truck again.
        </div>
      )}
      <div className="muted">Last weighment: <b>{prev?.method === 'photo' ? 'In slip photo' : kg(prev?.weight)}</b></div>
      {whoField}
      <div className="seg">
        <button type="button" className={!manual ? 'on' : ''} onClick={() => setMethod('photo')}>📷 Photo upload</button>
        <button type="button" className={manual ? 'on' : ''} onClick={() => setMethod('manual')}>✍ Manually</button>
      </div>
      <div className="form-grid">
        {manual
          ? <Field label="Re-Weight (kg) *"><input type="number" value={w} onChange={(e) => setW(e.target.value)} /></Field>
          : <Field label="Re-Weighment slip photo *"><PhotoInput value={photo} onChange={setPhoto} /></Field>}
        <Field label={manual ? 'Remark * (reason for delay / manual entry)' : 'Remark (reason for delay)'}><input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
      </div>
      {diff != null && (
        <div className={`alert ${diff ? 'warn' : 'ok'}`}>
          Difference from last weighment: <b>{diff > 0 ? '+' : ''}{kg(diff)}</b>{diff ? ' – check the truck before Gate-Out' : ' – weight matches'}
        </div>
      )}
      <button className="btn primary" disabled={!valid} onClick={submit}>Save Re-Weighment → Allow Gate-Out (TAT restarts)</button>
    </>
  );
}

/** Re-weighments done on this truck (list). */
function ReweighList({ a }) {
  if (!a.reweighs?.length) return null;
  return (
    <>
      <h4>Re-Weighments (exit TAT crossed)</h4>
      <table className="tbl mini">
        <thead><tr><th>#</th><th>Time</th><th>Weight</th><th>Late by</th><th>Remark</th></tr></thead>
        <tbody>
          {a.reweighs.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td><td>{fmtDT(r.time)} · {r.by}</td>
              <td>{r.method === 'photo' ? (r.photo ? <a href={r.photo} target="_blank" rel="noreferrer">Slip photo</a> : 'Slip photo') : kg(r.weight)}</td>
              <td>{minText(r.lateMin || 0)}</td><td>{r.remark || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function FinalWeighmentPage({ sub }) {
  const { state } = useStore();
  const late = (a) => !!exitTat(a, state.settings)?.late;
  return (
    <StagePage
      sub={sub} module="weighout" title="Final Weighment"
      subtitle={`${sub === 'purchase' ? 'After unloading' : 'After loading'}: ${weightName(sub, 'final')} – Weighbridge. Difference of the two weights = net material.`}
      tabs={[
        { key: 'final', label: 'Final Weighment Pending', stages: ['LOADED'], title: 'Final Weighment', Form: (p) => <WeightForm {...p} mode="final" /> },
        {
          key: 'reweigh', label: 'Re-Weighment (TAT late)', stages: ['CLEARED'], filter: late, title: 'Re-Weighment', Form: ReweighForm,
          cols: [{ label: 'Delay', value: (a) => minText(exitTat(a, state.settings)?.overMin || 0), danger: () => true }],
        },
        { key: 'history', label: 'History', stages: afterStage('LOADED'), title: 'Final Weighment History', Form: (p) => <WeightHistory {...p} mode="final" />, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ 4. Loading / Unloading ═══════════ */
// One-step form (no start / end timing): the supervisor records exactly which items went
// on the truck (Loading) or came off it (Unloading). Rows start from the advice; quantities
// can be changed, and any other item can be added – picked from Item Master or typed.
function LoadForm({ a, sub, done, edit }) {
  const { updateAdvice, state } = useStore();
  const [who, whoField] = useIncharge(sub, 'loading');
  const act = actOf(a); // this truck's actual purpose – Loading or Unloading
  const verb = act === 'Loading' ? 'loaded' : 'unloaded';
  const master = (state.items || []).filter((x) => x.active && (!x.use || x.use === a.type));
  // Every row's item can be changed (a different item went on / came off than the advice said).
  // Advice rows remember their original item in `orig`; on save a swapped row is split into
  // the advice item with 0 qty + an "Extra" row for what was actually handled.
  const [items, setItems] = useState(() => a.items.map((i) => ({
    ...i, loadQty: String(i.loadQty ?? i.planQty ?? ''), ...(i.extra ? {} : { orig: { desc: i.desc, size: i.size, grade: i.grade } }),
  })));
  const swapped = (i) => !i.extra && i.orig && ['desc', 'size', 'grade'].some((k) => String(i[k] || '').trim() !== String(i.orig[k] || '').trim());
  const [changeNote, setChangeNote] = useState(edit ? a.loading?.changeNote || '' : '');
  const setItem = (x, k, v) => setItems((s) => s.map((it, n) => (n === x ? { ...it, [k]: v } : it)));
  // Item → Size → Grade dropdowns from Item Master. Changing the item picks its first size / grade,
  // changing the size picks its first grade, so the row always stays a valid Item Master combination.
  const nm = (v) => String(v || '').trim().toLowerCase();
  const uniq = (l) => [...new Set(l.filter(Boolean))];
  const namesAll = uniq(master.map((m) => m.name));
  const sizesOf = (i) => uniq(master.filter((m) => nm(m.name) === nm(i.desc)).map((m) => m.size));
  const gradesOf = (i) => uniq(master.filter((m) => nm(m.name) === nm(i.desc) && nm(m.size) === nm(i.size)).map((m) => m.grade));
  const pick = (x, k, v) => setItems((s) => s.map((it, n) => {
    if (n !== x) return it;
    const r = { ...it, [k]: v };
    if (k === 'desc') { r.size = sizesOf(r)[0] || ''; r.grade = gradesOf(r)[0] || ''; }
    if (k === 'size') r.grade = gradesOf(r)[0] || '';
    return r;
  }));
  // one dropdown cell; the row's current value stays listed even if it is not in Item Master
  const Pick = ({ x, k, opts, ph }) => {
    const v = items[x][k] || '';
    const all = v && !opts.some((o) => nm(o) === nm(v)) ? [v, ...opts] : opts;
    return (
      <select value={all.find((o) => nm(o) === nm(v)) || ''} onChange={(e) => pick(x, k, e.target.value)} style={{ width: '100%' }}>
        {!v && <option value="">{ph}</option>}
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  };
  const changed = items.some((i) => i.extra || swapped(i) || Number(i.loadQty) !== Number(i.planQty));
  const itemsOk = items.every((i) => i.desc.trim() && i.loadQty !== '' && Number(i.loadQty) >= 0) && items.some((i) => Number(i.loadQty) > 0);
  const total = items.reduce((s, i) => s + (Number(i.loadQty) || 0), 0);

  return (
    <>
      <div className="alert info">1st weight: {a.tare?.method === 'photo' ? 'in slip photo' : kg(a.tare?.weight)} · Advice total <b>{plannedTotal(a)} MT</b></div>
      {whoField}
      <h4>Items {verb}</h4>
      <p className="muted">Enter the quantity actually {verb} for each advice item (0 if it was not {verb}). If a different item was {verb}, change its Item / Size / Grade in that row. Use "+ Add item" for anything else that was {verb}.</p>
      <table className="tbl mini">
        <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Advice (MT)</th><th>{act === 'Loading' ? 'Loaded' : 'Unloaded'} (MT) *</th><th /></tr></thead>
        <tbody>
          {items.map((i, x) => {
            const diff = i.extra || swapped(i) || Number(i.loadQty) !== Number(i.planQty);
            return (
              <tr key={x}>
                <td>
                  {master.length > 0
                    ? <Pick x={x} k="desc" opts={namesAll} ph="— Select item * —" />
                    : <input value={i.desc} placeholder="Item *" onChange={(e) => setItem(x, 'desc', e.target.value)} />}
                  {swapped(i) && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      Advice: {i.orig.desc} {i.orig.size} {i.orig.grade}{' '}
                      <button className="btn sm" style={{ padding: '0 6px' }} onClick={() => setItems((s) => s.map((it, n) => (n === x ? { ...it, ...it.orig } : it)))}>Undo</button>
                    </div>
                  )}
                </td>
                <td>{master.length > 0 ? <Pick x={x} k="size" opts={sizesOf(i)} ph="— Size —" /> : <input value={i.size} onChange={(e) => setItem(x, 'size', e.target.value)} />}</td>
                <td>{master.length > 0 ? <Pick x={x} k="grade" opts={gradesOf(i)} ph="— Grade —" /> : <input value={i.grade} onChange={(e) => setItem(x, 'grade', e.target.value)} />}</td>
                <td>{i.extra ? <span className="badge amber">Extra</span> : <>{i.planQty}{swapped(i) && <span className="badge amber" style={{ marginLeft: 6 }}>Changed</span>}</>}</td>
                <td className={diff ? 'tone-amber' : ''}>
                  <input type="number" step="0.01" min="0" value={i.loadQty} onChange={(e) => setItem(x, 'loadQty', e.target.value)} style={{ width: 90 }} />
                </td>
                <td>{i.extra && <button className="icon-btn" title="Remove" onClick={() => setItems((s) => s.filter((_, n) => n !== x))}>✕</button>}</td>
              </tr>
            );
          })}
          <tr><td colSpan={3}><b>Total</b></td><td>{plannedTotal(a)}</td><td><b>{Math.round(total * 1000) / 1000}</b></td><td /></tr>
        </tbody>
      </table>
      <button className="btn sm" onClick={() => setItems((s) => [...s, { desc: '', size: '', grade: '', reqQty: 0, planQty: 0, loadQty: '', extra: true }])}>
        + Add item
      </button>
      {changed && (
        <div className="form-grid">
          <Field label="Reason for change from advice *" span={2}>
            <input value={changeNote} placeholder="e.g. Party asked for 2 MT extra by phone / stock was low" onChange={(e) => setChangeNote(e.target.value)} />
          </Field>
        </div>
      )}

      <button className="btn primary" disabled={!itemsOk || (changed && !changeNote.trim())} onClick={() => {
        const note = changed ? changeNote.trim() : '';
        const saved = items.flatMap(({ orig, ...i }) => {
          const row = { ...i, desc: i.desc.trim(), loadQty: Number(i.loadQty) || 0 };
          if (!swapped({ ...i, orig })) return [row];
          // advice item was not handled – a different item was
          return [{ ...row, ...orig, loadQty: 0 }, { ...row, reqQty: 0, planQty: 0, extra: true }];
        });
        updateAdvice(a.id, edit
          ? { items: saved, loading: { ...a.loading, changeNote: note, editedBy: who, editedAt: nowISO() } }
          : { stage: 'LOADED', items: saved, loading: { end: nowISO(), by: who, endBy: who, changeNote: note } });
        done();
      }}>
        {edit ? `Save Changes to ${act}` : `Save ${act} → Send to Final Weighment`}
      </button>
    </>
  );
}

/** Read-only record once loading/unloading is saved – kept visible on every later stage. */
function LoadingHistory({ a }) {
  const act = actOf(a);
  if (!a.loading?.end) return <div className="alert">{act} is not complete for this truck yet.</div>;
  return (
    <>
      <h4>{act} History</h4>
      <table className="kvt"><tbody>
        <tr><th>Recorded</th><td>{fmtDT(a.loading.end)} · {a.loading.endBy || a.loading.by}</td></tr>
        <tr><th>Qty</th><td>Advice {plannedTotal(a)} MT → {act === 'Loading' ? 'Loaded' : 'Unloaded'} {loadedTotal(a)} MT</td></tr>
        {a.loading.changeNote && <tr><th>Item change</th><td><span className="tone-amber">{a.loading.changeNote}</span></td></tr>}
        {a.loading.editedAt && <tr><th>Last edited</th><td>{fmtDT(a.loading.editedAt)} · {a.loading.editedBy}</td></tr>}
      </tbody></table>
      <AdviceVsActual a={a} />
    </>
  );
}

export function LoadingPage({ sub }) {
  const L = labelsFor(sub);
  return (
    <StagePage
      sub={sub} module="loading" title={L.act} subtitle={`${L.act} Supervisor – record which items were ${L.act === 'Loading' ? 'loaded on' : 'unloaded from'} the truck.`}
      tabs={[
        { key: 'pending', label: `${L.act} Pending`, stages: ['TARE_DONE'], title: `Record ${L.act}`, Form: LoadForm },
        {
          key: 'history', label: 'History', stages: afterStage('TARE_DONE'),
          title: `${L.act} History`, Form: LoadingHistory, readOnly: true,
          Edit: LoadForm, editable: (a) => ['LOADED', 'FINAL_DONE'].includes(a.stage),
          cols: [{ label: 'Qty (MT)', value: (a) => `${plannedTotal(a)} → ${loadedTotal(a)}` }],
        },
      ]}
    />
  );
}

/**
 * Side-by-side check: on the left what the Advice asked for, on the right what the
 * loading / unloading supervisor actually put on (or took off) the truck.
 * Shown to Billing, Document Verification (sales) and Material Receipt (purchase).
 */
function AdviceVsActual({ a }) {
  const act = actOf(a);
  const done = act === 'Loading' ? 'Loaded' : 'Unloaded';
  const planned = a.items.filter((i) => !i.extra);
  const actual = a.items.filter((i) => Number(i.loadQty ?? i.planQty ?? 0) > 0 || i.extra);
  const qtyOf = (i) => Number(i.loadQty ?? i.planQty ?? 0);
  const mismatch = a.items.some((i) => i.extra || qtyOf(i) !== Number(i.planQty || 0));
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return (
    <>
      <h4>Advice vs Actual {act}</h4>
      {mismatch
        ? <div className="alert warn">Actual {act.toLowerCase()} differs from the advice{a.loading?.changeNote ? <> – <b>{a.loading.changeNote}</b></> : ''}</div>
        : <div className="alert ok">Actual {act.toLowerCase()} matches the advice.</div>}
      <div className="side-by-side">
        <div className="sbs-col">
          <div className="sbs-head">Advice (planned){a.no ? <span className="muted"> · {a.no}</span> : null}</div>
          <table className="tbl mini">
            <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Qty (MT)</th></tr></thead>
            <tbody>
              {planned.map((i, x) => (
                <tr key={x}><td>{i.desc}</td><td>{i.size}</td><td>{i.grade}</td><td>{i.planQty}</td></tr>
              ))}
              <tr><td colSpan={3}><b>Total</b></td><td><b>{r3(plannedTotal(a))}</b></td></tr>
            </tbody>
          </table>
        </div>
        <div className="sbs-col">
          <div className="sbs-head">{done} by supervisor{a.loading?.endBy || a.loading?.by ? <span className="muted"> · {a.loading.endBy || a.loading.by}</span> : null}</div>
          {!a.loading?.end && <div className="alert">{act} not recorded yet.</div>}
          <table className="tbl mini">
            <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Qty (MT)</th></tr></thead>
            <tbody>
              {actual.map((i, x) => {
                const diff = i.extra || qtyOf(i) !== Number(i.planQty || 0);
                return (
                  <tr key={x}>
                    <td>{i.desc}{i.extra && <span className="badge amber" style={{ marginLeft: 6 }}>Extra</span>}</td>
                    <td>{i.size}</td><td>{i.grade}</td>
                    <td className={diff ? 'tone-amber' : ''}>
                      <b>{qtyOf(i)}</b>
                      {diff && !i.extra && <span className="muted"> ({qtyOf(i) - Number(i.planQty || 0) > 0 ? '+' : ''}{r3(qtyOf(i) - Number(i.planQty || 0))})</span>}
                    </td>
                  </tr>
                );
              })}
              {planned.filter((i) => qtyOf(i) === 0).map((i, x) => (
                <tr key={'z' + x}><td>{i.desc}</td><td>{i.size}</td><td>{i.grade}</td><td className="tone-amber"><b>0</b> <span className="muted">(not {done.toLowerCase()})</span></td></tr>
              ))}
              <tr><td colSpan={3}><b>Total</b></td><td className={mismatch ? 'tone-amber' : ''}><b>{loadedTotal(a)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ═══════════ 6. Billing & Tax Invoice (Accounts) ═══════════ */
const BILL_CHECKS = ['Customer / Party', 'Order Quantity', 'Pending Order Quantity', 'Applicable Order Rate', 'Item and Size', 'Final Loading Quantity', 'Final Weight Slip', 'Statutory requirements & applicable taxes'];

function BillingForm({ a, sub, done, edit }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'billing');
  const [c, setC] = useState({});
  const net = netOf(a);
  const exWorks = termsOf(a) === 'ex'; // Ex-Works: freight is paid by the party – not added to invoice
  const old = edit ? a.billing || {} : null;
  const [f, setF] = useState(old ? {
    qty: String(old.qty ?? ''), rate: String(old.rate ?? ''), gauge: String(old.gauge || ''), extra: String(old.extra || ''),
    freight: exWorks ? '' : String(old.freight || ''), other: String(old.other || ''), gstPct: String(old.gstPct ?? '18'),
    invoiceNo: old.invoiceNo || '', ewayBill: old.ewayBill || '', remark: old.remark || '',
  } : {
    qty: net != null ? (net / 1000).toFixed(3) : String(loadedTotal(a) || ''),
    rate: String(a.rate || ''),
    gauge: '', extra: '', freight: exWorks ? '' : String(a.freight || ''), other: '',
    gstPct: '18', invoiceNo: '', ewayBill: '', remark: '',
  });
  const n = (k) => Number(f[k]) || 0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const basic = n('qty') * n('rate');
  const freightAmt = exWorks ? 0 : n('freight');
  const taxable = basic + n('gauge') + n('extra') + freightAmt + n('other');
  const gstAmt = (taxable * n('gstPct')) / 100;
  const total = taxable + gstAmt;
  const ok = BILL_CHECKS.every((x) => c[x]) && f.invoiceNo.trim() && f.ewayBill.trim() && n('qty') > 0 && n('rate') > 0;

  return (
    <>
      <div className="alert info">
        Final weight: <b>{netText(a)}</b> {net != null && <>(Tare {kg(a.tare.weight)} → Final {kg(a.final.weight)})</>} · Planned {plannedTotal(a)} MT{loadedTotal(a) !== plannedTotal(a) && <> · <b>Loaded {loadedTotal(a)} MT</b></>} · Order rate ₹ {Number(a.rate || 0).toLocaleString('en-IN')}/MT
      </div>
      <div className="alert info">Freight terms: <b>{termsText(a.type, termsOf(a))}</b></div>
      {a.final?.method === 'photo' && <div className="alert warn">Final weight is in the slip photo – enter the quantity from the slip.</div>}
      <AdviceVsActual a={a} />
      {whoField}

      <h4>Billing Value</h4>
      <div className="form-grid">
        <Field label="Final billing quantity (MT) *" hint="From the verified final weighment"><input type="number" step="0.001" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Applicable order rate (₹/MT) *"><input type="number" value={f.rate} onChange={set('rate')} /></Field>
        <Field label="Gauge / size difference (₹)"><input type="number" value={f.gauge} onChange={set('gauge')} placeholder="0" /></Field>
        <Field label="Additional charges (₹)"><input type="number" value={f.extra} onChange={set('extra')} placeholder="0" /></Field>
        <Field label="Freight / transport charges (₹)" hint={exWorks ? 'Ex-Works – freight is paid by the party, not added to invoice' : 'FOR – freight is added to invoice'}>
          <input type="number" value={exWorks ? '' : f.freight} onChange={set('freight')} placeholder="0" disabled={exWorks} />
        </Field>
        <Field label="Other approved adjustments (₹)"><input type="number" value={f.other} onChange={set('other')} placeholder="0" /></Field>
      </div>

      <table className="tbl mini amt">
        <tbody>
          <tr><td>Basic value ({f.qty || 0} MT × ₹ {Number(f.rate || 0).toLocaleString('en-IN')})</td><td>{rs(basic)}</td></tr>
          <tr><td>Gauge / size difference</td><td>{rs(n('gauge'))}</td></tr>
          <tr><td>Additional charges</td><td>{rs(n('extra'))}</td></tr>
          <tr><td>Freight {exWorks && <span className="muted">(Ex-Works – not added)</span>}</td><td>{rs(freightAmt)}</td></tr>
          <tr><td>Other adjustments</td><td>{rs(n('other'))}</td></tr>
          <tr className="sum"><td>Taxable value</td><td>{rs(taxable)}</td></tr>
          <tr><td>GST <input className="pct" type="number" value={f.gstPct} onChange={set('gstPct')} /> %</td><td>{rs(gstAmt)}</td></tr>
          <tr className="grand"><td>Invoice total</td><td>{rs(total)}</td></tr>
        </tbody>
      </table>

      <h4>Tax Invoice & E-Way Bill</h4>
      <div className="form-grid">
        <Field label="Final Tax Invoice No. *"><input value={f.invoiceNo} onChange={set('invoiceNo')} /></Field>
        <Field label="E-Way Bill No. *"><input value={f.ewayBill} onChange={set('ewayBill')} /></Field>
        <Field label="Remark" span={2}><input value={f.remark} onChange={set('remark')} /></Field>
      </div>

      <h4>Verification</h4>
      <Checks items={BILL_CHECKS} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={() => {
        const billing = {
          qty: n('qty'), rate: n('rate'), basic, gauge: n('gauge'), extra: n('extra'), freight: freightAmt, terms: termsOf(a), other: n('other'),
          taxable, gstPct: n('gstPct'), gstAmt, total,
          invoiceNo: f.invoiceNo.trim(), ewayBill: f.ewayBill.trim(), remark: f.remark.trim(), time: nowISO(), by: who,
        };
        updateAdvice(a.id, edit
          ? { billing: { ...billing, time: old.time, by: old.by, editedBy: who, editedAt: nowISO() } }
          : { stage: 'BILLED', billing });
        done();
      }}>
        {edit ? 'Save Changes to Billing' : 'Complete Billing → Send to Document Verification'}
      </button>
    </>
  );
}

/** Read-only billing record – kept visible on every later stage. */
function BillingHistory({ a }) {
  const b = a.billing;
  if (!b) return <div className="alert">Billing is not complete yet.</div>;
  return (
    <>
      <h4>Billing History</h4>
      <table className="kvt"><tbody>
        <tr><th>Qty × Rate</th><td>{b.qty} MT × {rs(b.rate)}</td></tr>
        <tr><th>Basic Value</th><td>{rs(b.basic)}</td></tr>
        <tr><th>Taxable Value</th><td>{rs(b.taxable)}</td></tr>
        <tr><th>GST ({b.gstPct}%)</th><td>{rs(b.gstAmt)}</td></tr>
        <tr><th>Invoice Total</th><td><b>{rs(b.total)}</b></td></tr>
        <tr><th>Tax Invoice No.</th><td>{b.invoiceNo}</td></tr>
        <tr><th>E-Way Bill No.</th><td>{b.ewayBill}</td></tr>
        <tr><th>Billed</th><td>{fmtDT(b.time)} · {b.by}</td></tr>
        {b.remark && <tr><th>Remark</th><td>{b.remark}</td></tr>}
        {b.editedAt && <tr><th>Last edited</th><td>{fmtDT(b.editedAt)} · {b.editedBy}</td></tr>}
      </tbody></table>
      <AdviceVsActual a={a} />
    </>
  );
}

export function BillingPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="billing" title="Billing" subtitle="Accounts / Billing – billing and tax invoice based on the final weighment."
      tabs={[
        { key: 'b', label: 'Billing Pending', stages: ['FINAL_DONE'], title: 'Billing & Tax Invoice Preparation', Form: BillingForm },
        { key: 'history', label: 'History', stages: afterStage('FINAL_DONE'), title: 'Billing History', Form: BillingHistory, readOnly: true, Edit: BillingForm, editable: (a) => a.stage === 'BILLED' },
      ]}
    />
  );
}

/* ═══════════ 7. Document Verification (Dispatch) ═══════════ */
const DOC_CHECKS = ['Invoice details are correct', 'Vehicle number is correct', 'Quantity / weight is correct', 'E-Way Bill details are correct', 'Transport documents are available', 'Required approvals are completed', 'Documents stamped and signed'];

// Verifying the documents issues the Gate Pass (and our Bilty / LR) straight away –
// there is no separate Gate Pass step; the truck goes on to Security Clearance.
function DocVerifyForm({ a, sub, done }) {
  const { updateAdvice, state } = useStore();
  const [who, whoField] = useIncharge(sub, 'docverify');
  const [c, setC] = useState({});
  const [remark, setRemark] = useState('');
  const b = a.billing || {};
  const { gatePassNo, biltyNo } = nextDispatchNos(state.advices);
  const ok = DOC_CHECKS.every((x) => c[x]);
  return (
    <>
      <div className="alert info">
        Invoice <b>{b.invoiceNo}</b> · E-Way Bill <b>{b.ewayBill}</b> · Qty <b>{b.qty} MT</b> · Total <b>{rs(b.total)}</b> · Billing by {b.by}
      </div>
      <div className="alert ok">On verifying, these will be created: Bilty No. <b>{biltyNo}</b> · Gate Pass <b>{gatePassNo}</b></div>
      <AdviceVsActual a={a} />
      {whoField}
      <div className="form-grid">
        <Field label="Remark" span={2}><input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
      </div>
      <h4>Dispatch Checklist</h4>
      <Checks items={DOC_CHECKS} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={() => {
        const time = nowISO();
        updateAdvice(a.id, {
          stage: 'GATEPASS',
          docVerify: { remark, time, by: who },
          dispatch: { remark: '', time, by: who, gatePassNo, biltyNo },
        });
        done();
      }}>
        Documents OK → Generate Gate Pass → Send to Security Clearance
      </button>
    </>
  );
}

/** Read-only record once documents are verified (with the gate pass issued on verification). */
function DocVerifyHistory({ a }) {
  if (!a.docVerify) return <div className="alert">Document verification is not done yet.</div>;
  return (
    <>
      <h4>Document Verification History</h4>
      <table className="kvt"><tbody>
        <tr><th>Verified</th><td>{fmtDT(a.docVerify.time)} · {a.docVerify.by}</td></tr>
        {a.docVerify.remark && <tr><th>Remark</th><td>{a.docVerify.remark}</td></tr>}
      </tbody></table>
      <AdviceVsActual a={a} />
      <GatePassSheet a={a} />
    </>
  );
}

export function DocVerifyPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="docverify" title="Document Verification" subtitle="Dispatch – verify the Accounts documents; the Gate Pass is generated on verification."
      tabs={[
        { key: 'v', label: 'Verification Pending', stages: ['BILLED'], title: 'Dispatch Document Verification', Form: DocVerifyForm },
        { key: 'history', label: 'History', stages: afterStage('BILLED'), title: 'Document Verification History', Form: DocVerifyHistory, readOnly: true },
      ]}
    />
  );
}


/* ═══════════ 9. Security Clearance ═══════════ */
const CLEAR_CHECKS = ['Vehicle Number', 'Gate Pass', 'Invoice', 'E-Way Bill', 'Transport Document / LR', 'Final Weight / Quantity', 'Driver / transporter details', 'Final vehicle checking done'];

function ClearanceForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'clearance');
  const [c, setC] = useState({});
  const [lr, setLr] = useState('');
  const needLr = a.type === 'sales';
  const typed = lr.trim().toUpperCase();
  const match = typed && typed === a.dispatch?.biltyNo?.toUpperCase();
  const ok = CLEAR_CHECKS.every((x) => c[x]) && (!needLr || match);
  return (
    <>
      <div className="notes"><b>Gate Pass: {a.dispatch?.gatePassNo}</b> · Invoice {a.billing?.invoiceNo || '—'} · E-Way {a.billing?.ewayBill || '—'} · Net {netText(a)}</div>
      {needLr && (
        <>
          <h4>Bilty Number Match</h4>
          <div className="form-grid">
            <Field label="Enter the Bilty / LR No. carried by the truck *"><input value={lr} onChange={(e) => setLr(e.target.value)} placeholder="LR-2026-0001" /></Field>
          </div>
          {typed && (match
            ? <div className="alert ok">✔ Bilty number matches</div>
            : <div className="alert warn">✘ Bilty number does not match – confirm with Dispatch</div>)}
        </>
      )}
      {whoField}
      <h4>Security shall verify</h4>
      <Checks items={CLEAR_CHECKS} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={() => {
        updateAdvice(a.id, { stage: 'CLEARED', clearance: { time: nowISO(), by: who } });
        done();
      }}>
        Give Clearance → Send to Gate-Out
      </button>
    </>
  );
}

/** Read-only record once security clearance is given – kept visible on every later stage. */
function ClearanceHistory({ a }) {
  if (!a.clearance) return <div className="alert">Security clearance is not done yet.</div>;
  return (
    <>
      <h4>Security Clearance History</h4>
      <table className="kvt"><tbody>
        <tr><th>Cleared</th><td>{fmtDT(a.clearance.time)} · {a.clearance.by}</td></tr>
      </tbody></table>
    </>
  );
}

export function ClearancePage({ sub }) {
  return (
    <StagePage
      sub={sub} module="clearance" title="Security Clearance" subtitle="Gate Security – final document and vehicle checking."
      tabs={[
        { key: 'c', label: 'Clearance Pending', stages: ['GATEPASS'], title: 'Final Security Checking', Form: ClearanceForm },
        { key: 'history', label: 'History', stages: afterStage('GATEPASS'), title: 'Security Clearance History', Form: ClearanceHistory, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ Purchase – Material Receipt (GRN) ═══════════ */
const GRN_CHECKS = ['Material matches the PO (item / size / grade)', 'Quantity verified against weighment', 'Supplier invoice received', 'Material quality checked'];

function GrnForm({ a, sub, done, edit }) {
  const { updateAdvice, state } = useStore();
  const [who, whoField] = useIncharge(sub, 'grn');
  const [c, setC] = useState({});
  const net = netOf(a);
  const netMT = net != null ? net / 1000 : null;
  const old = edit ? a.grn || {} : null;
  const [invoiceQty, setInvoiceQty] = useState(String(old ? old.invoiceQty ?? '' : loadedTotal(a) || ''));
  const [quality, setQuality] = useState(old?.quality || 'Accepted');
  const [remark, setRemark] = useState(old?.remark || '');
  const seq = String(state.advices.filter((x) => x.grn).length + 1).padStart(4, '0');
  const grnNo = old?.grnNo || `GRN-${new Date().getFullYear()}-${seq}`;
  // Material received (loaded − empty vehicle) vs ordered, and vs supplier invoice
  const ordered = Number(a.reqQty) || plannedTotal(a);
  const diff = netMT != null && Number(invoiceQty) ? netMT - Number(invoiceQty) : null;
  const orderedDiff = netMT != null && ordered ? netMT - ordered : null;
  const off = (d, base) => d != null && Math.abs(d) > base * 0.005; // 0.5% tolerance
  const needRemark = quality !== 'Accepted' || off(diff, Number(invoiceQty)) || off(orderedDiff, ordered);
  const ok = GRN_CHECKS.every((x) => c[x]) && Number(invoiceQty) > 0 && (!needRemark || remark.trim());
  const sgn = (d) => `${d > 0 ? '+' : ''}${d.toFixed(3)} MT`;
  return (
    <>
      <div className="alert info">
        Loaded vehicle {a.tare?.method === 'photo' ? 'in slip photo' : kg(a.tare?.weight)} − empty vehicle {a.final?.method === 'photo' ? 'in slip photo' : kg(a.final?.weight)} = material received <b>{netMT != null ? `${netMT.toFixed(3)} MT` : 'see slip photo'}</b>
      </div>
      <div className="alert info">
        Ordered: <b>{ordered} MT</b> · Supplier invoice {a.gateIn?.invoiceNo || '—'} · Bilty {a.gateIn?.biltyNo || '—'}
      </div>
      {orderedDiff != null && (
        <div className={`alert ${off(orderedDiff, ordered) ? 'warn' : 'ok'}`}>
          Received vs ordered: <b>{sgn(orderedDiff)}</b> {off(orderedDiff, ordered) ? (orderedDiff < 0 ? '(received less – enter remark)' : '(received more – enter remark)') : '(full quantity received)'}
        </div>
      )}
      <AdviceVsActual a={a} />
      {whoField}
      <div className="form-grid">
        <Field label="Supplier invoice quantity (MT) *"><input type="number" step="0.001" value={invoiceQty} onChange={(e) => setInvoiceQty(e.target.value)} /></Field>
        <Field label="Quality *">
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option>Accepted</option>
            <option>Accepted with deviation</option>
            <option>Rejected</option>
          </select>
        </Field>
      </div>
      {diff != null && (
        <div className={`alert ${off(diff, Number(invoiceQty)) ? 'warn' : 'ok'}`}>
          Received vs supplier invoice: <b>{sgn(diff)}</b> {off(diff, Number(invoiceQty)) ? '(short / excess – enter remark)' : '(OK)'}
        </div>
      )}
      <div className="form-grid">
        <Field label={`Remark${needRemark ? ' *' : ''}`} span={2}><textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
      </div>
      <h4>Material Receipt Checklist</h4>
      <Checks items={GRN_CHECKS} state={c} setState={setC} />
      <div className="alert ok">{edit ? <>Editing GRN No. <b>{grnNo}</b></> : <>On saving, GRN No. <b>{grnNo}</b> will be created.</>}</div>
      <button className="btn primary" disabled={!ok} onClick={() => {
        const grn = { grnNo, netQty: netMT, orderedQty: ordered, invoiceQty: Number(invoiceQty), quality, remark: remark.trim(), time: nowISO(), by: who };
        updateAdvice(a.id, edit ? { grn: { ...grn, time: old.time, by: old.by, editedBy: who, editedAt: nowISO() } } : { stage: 'CLEARED', grn });
        done();
      }}>
        {edit ? 'Save Changes to GRN' : 'Save GRN → Send to Gate-Out (empty vehicle)'}
      </button>
    </>
  );
}

function GrnHistory({ a }) {
  const g = a.grn;
  if (!g) return <div className="alert">GRN is not created yet.</div>;
  return (
    <>
      <h4>Material Receipt (GRN) History</h4>
      <table className="kvt"><tbody>
        <tr><th>GRN No.</th><td><b>{g.grnNo}</b></td></tr>
        <tr><th>Ordered</th><td>{(g.orderedQty ?? (Number(a.reqQty) || plannedTotal(a)))} MT</td></tr>
        <tr><th>Net received</th><td>{g.netQty != null ? `${Number(g.netQty).toFixed(3)} MT` : 'In slip photo'}</td></tr>
        <tr><th>Invoice qty</th><td>{g.invoiceQty != null ? `${g.invoiceQty} MT` : '—'}</td></tr>
        <tr><th>Quality</th><td>{g.quality}</td></tr>
        {g.remark && <tr><th>Remark</th><td>{g.remark}</td></tr>}
        <tr><th>Received</th><td>{fmtDT(g.time)} · {g.by}</td></tr>
        {g.editedAt && <tr><th>Last edited</th><td>{fmtDT(g.editedAt)} · {g.editedBy}</td></tr>}
      </tbody></table>
      <AdviceVsActual a={a} />
    </>
  );
}

export function GrnPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="grn" title="Material Receipt (GRN)" subtitle="Store – receive the unloaded material after matching it with the PO and supplier invoice."
      tabs={[
        { key: 'g', label: 'GRN Pending', stages: ['FINAL_DONE'], title: 'Material Receipt (GRN)', Form: GrnForm },
        { key: 'history', label: 'History', stages: ['CLEARED', 'OUT'], title: 'GRN History', Form: GrnHistory, readOnly: true, Edit: GrnForm, editable: (a) => a.stage === 'CLEARED' && !!a.grn },
      ]}
    />
  );
}

/* ═══════════ 10. Gate-Out ═══════════ */
function GateOutForm({ a, sub, done }) {
  const { updateAdvice, state } = useStore();
  const t = exitTat(a, state.settings);
  const [who, whoField] = useIncharge(sub, 'gateout');
  const [c, setC] = useState({});
  const purchase = a.type === 'purchase';
  const hasBelongings = (a.gateIn?.belongings || []).length > 0;
  const items = [
    ...(purchase
      ? ['Vehicle is completely empty (fully unloaded)', 'No material of ours remains in the vehicle', 'Details recorded in Gate-Out Register / System']
      : ['Details recorded in Gate-Out Register / System', 'No discrepancy found']),
    ...(hasBelongings ? ["Driver's belongings match the Gate-In list (nothing extra going out)"] : []),
  ];
  const ok = items.every((x) => c[x]) && !t?.late;
  return (
    <>
      {t && (t.late ? (
        <div className="alert danger">
          ⛔ Exit TAT crossed – {minText(t.elapsedMin)} since last weighment (limit {minText(t.limitMin)}, late by <b>{minText(t.overMin)}</b>).
          Gate-Out is blocked: send the truck for <b>Re-Weighment</b> (Final Weighment → Re-Weighment tab).
        </div>
      ) : (
        <div className="alert info">Exit TAT: <b>{minText(t.leftMin)}</b> left (limit {minText(t.limitMin)} from last weighment {fmtDT(t.from)})</div>
      ))}
      <ReweighList a={a} />
      {purchase
        ? <div className="alert ok">✔ GRN is done ({a.grn?.grnNo} · {a.grn?.by}) · Empty vehicle Gate-Out</div>
        : <div className="alert ok">✔ Security clearance is done ({a.clearance?.by}) · Gate Pass {a.dispatch?.gatePassNo}</div>}
      <h4>Driver's Belongings (recorded at Gate-In)</h4>
      <BelongingsTable a={a} />
      {whoField}
      <h4>Gate-Out Recording</h4>
      <Checks items={items} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={() => {
        updateAdvice(a.id, { stage: 'OUT', gateOut: { time: nowISO(), by: who } });
        done();
      }}>
        Record Gate-Out → Vehicle Release
      </button>
    </>
  );
}

/** Read-only record once the vehicle is released – final entry of the whole chain. */
function GateOutHistory({ a }) {
  if (!a.gateOut) return <div className="alert">Gate-Out is not done yet.</div>;
  return (
    <>
      <h4>Gate-Out History</h4>
      <table className="kvt"><tbody>
        <tr><th>Released</th><td>{fmtDT(a.gateOut.time)} · {a.gateOut.by}</td></tr>
        {a.final?.time && <tr><th>Final weighment → Gate-Out</th><td>{minText(Math.floor((new Date(a.gateOut.time) - new Date(a.final.time)) / 60000))}</td></tr>}
      </tbody></table>
      <ReweighList a={a} />
    </>
  );
}

export function GateOutPage({ sub }) {
  const { state } = useStore();
  // Delay column: how late the truck is on the exit TAT (or how much time is left).
  const delayCol = {
    label: 'Delay',
    value: (a) => {
      const t = exitTat(a, state.settings);
      if (!t) return '—';
      return t.late ? `${minText(t.overMin)} – Re-Weighment` : `No delay (${minText(t.leftMin)} left)`;
    },
    danger: (a) => !!exitTat(a, state.settings)?.late,
  };
  return (
    <StagePage
      sub={sub} module="gateout" title="Gate-Out" subtitle="Vehicle release at the main gate and Gate-Out register entry. Truck must leave within the exit TAT after its last weighment."
      tabs={[
        { key: 'out', label: 'Gate-Out Pending', stages: ['CLEARED'], title: 'Gate-Out Record', Form: GateOutForm, cols: [delayCol] },
        { key: 'history', label: 'History', stages: afterStage('CLEARED'), title: 'Gate-Out History', Form: GateOutHistory, readOnly: true },
      ]}
    />
  );
}
