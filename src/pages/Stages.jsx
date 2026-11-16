import React, { useState } from 'react';
import StagePage from '../components/StagePage.jsx';
import { Field, PhotoInput, biltyOf, fmtDT, kg, loadedTotal, netOf, netText, plannedTotal } from '../components/ui.jsx';
import { GatePassSheet } from './Documents.jsx';
import { useStore } from '../store.jsx';
import { actOf, afterStage, labelsFor, termsOf, termsText, userCan, weBearFreight } from '../data.js';

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

function GateInForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'gatein');
  const [c, setC] = useState({});
  // Purchase: driver brings the supplier's bilty; only its number (+ photo) is recorded here.
  const [doc, setDoc] = useState({ biltyNo: '', biltyPhoto: '', invoiceNo: '', ewayBill: '' });
  const purchase = a.type === 'purchase';
  // LR matters most when the freight is ours (Ex-Works) – then it is mandatory, otherwise optional.
  const lrRequired = purchase && weBearFreight(a);
  const ok = GATE_IN_CHECKS.every((x) => c[x]) && (!lrRequired || doc.biltyNo.trim());
  const set = (k) => (e) => setDoc({ ...doc, [k]: e.target.value });
  const save = () => {
    const d = purchase
      ? { biltyNo: doc.biltyNo.trim().toUpperCase(), biltyPhoto: doc.biltyPhoto, invoiceNo: doc.invoiceNo.trim(), ewayBill: doc.ewayBill.trim() }
      : {};
    updateAdvice(a.id, { stage: 'GATED_IN', gateIn: { time: nowISO(), by: who, ...d } });
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

export function FinalWeighmentPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="weighout" title="Final Weighment"
      subtitle={`${sub === 'purchase' ? 'After unloading' : 'After loading'}: ${weightName(sub, 'final')} – Weighbridge. Difference of the two weights = net material.`}
      tabs={[
        { key: 'final', label: 'Final Weighment Pending', stages: ['LOADED'], title: 'Final Weighment', Form: (p) => <WeightForm {...p} mode="final" /> },
        { key: 'history', label: 'History', stages: afterStage('LOADED'), title: 'Final Weighment History', Form: (p) => <WeightHistory {...p} mode="final" />, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ 4. Loading / Unloading ═══════════ */
// Real-time two-step flow: incharge presses "Start" the moment loading actually
// begins (time is stamped then, not typed), and "End" the moment it finishes.
function LoadForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'loading');
  const act = actOf(a); // this truck's actual purpose – Loading or Unloading
  const [reason, setReason] = useState('');
  const started = a.loading?.start;
  // Actual items – start from the plan; supervisor can change qty or add an item that also went on/off.
  const [items, setItems] = useState(() => a.items.map((i) => ({ ...i, loadQty: String(i.loadQty ?? i.planQty ?? '') })));
  const [editing, setEditing] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const setItem = (x, k, v) => setItems((s) => s.map((it, n) => (n === x ? { ...it, [k]: v } : it)));
  const changed = items.some((i) => i.extra || Number(i.loadQty) !== Number(i.planQty));
  const itemsOk = items.every((i) => i.desc.trim() && i.loadQty !== '' && Number(i.loadQty) >= 0);
  const total = items.reduce((s, i) => s + (Number(i.loadQty) || 0), 0);

  if (!started) {
    return (
      <>
        <div className="alert info">Target: <b>{a.targetHours} hours</b> to complete {act.toLowerCase()} · 1st weight: {a.tare?.method === 'photo' ? 'in slip photo' : kg(a.tare?.weight)}</div>
        {whoField}
        <button className="btn primary" onClick={() => {
          updateAdvice(a.id, { loading: { start: nowISO(), by: who } });
        }}>
          ▶ Start {act} (current time will be recorded)
        </button>
      </>
    );
  }

  const hrs = (Date.now() - new Date(started)) / 3600000;
  const delayMin = a.targetHours && hrs > a.targetHours ? Math.round((hrs - a.targetHours) * 60) : 0;
  const delayText = `${Math.floor(delayMin / 60) ? Math.floor(delayMin / 60) + ' hr ' : ''}${delayMin % 60} min`;
  return (
    <>
      <div className="alert ok">{act} started: <b>{fmtDT(started)}</b> ({a.loading?.by})</div>
      {whoField}
      {delayMin > 0 && (
        <>
          <div className="alert danger">Delay so far: <b>{delayText}</b> (target {a.targetHours} hrs)</div>
          <div className="form-grid">
            <Field label="Reason for delay *" span={2}><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
        </>
      )}
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        Actual {act.toLowerCase()} items
        {!editing && <button className="btn sm" onClick={() => setEditing(true)}>✎ Edit items</button>}
      </h4>
      <p className="muted">If the quantity {act === 'Loading' ? 'loaded' : 'unloaded'} differs from the plan, or another item was {act === 'Loading' ? 'loaded' : 'unloaded'}, click "Edit items".</p>
      <table className="tbl mini">
        <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Plan (MT)</th><th>Actual (MT)</th><th /></tr></thead>
        <tbody>
          {items.map((i, x) => {
            const diff = i.extra || Number(i.loadQty) !== Number(i.planQty);
            return (
              <tr key={x}>
                {['desc', 'size', 'grade'].map((k) => (
                  <td key={k}>
                    {editing && i.extra ? <input value={i[k]} placeholder={k === 'desc' ? 'Item *' : ''} onChange={(e) => setItem(x, k, e.target.value)} />
                      : <>{i[k]}{k === 'desc' && i.extra && <span className="badge amber" style={{ marginLeft: 6 }}>Extra</span>}</>}
                  </td>
                ))}
                <td>{i.extra ? '—' : i.planQty}</td>
                <td className={diff ? 'tone-amber' : ''}>
                  {editing ? <input type="number" step="0.01" min="0" value={i.loadQty} onChange={(e) => setItem(x, 'loadQty', e.target.value)} style={{ width: 90 }} /> : <b>{i.loadQty}</b>}
                </td>
                <td>{editing && i.extra && <button className="icon-btn" onClick={() => setItems((s) => s.filter((_, n) => n !== x))}>✕</button>}</td>
              </tr>
            );
          })}
          <tr><td colSpan={3}><b>Total</b></td><td>{plannedTotal(a)}</td><td><b>{Math.round(total * 1000) / 1000}</b></td><td /></tr>
        </tbody>
      </table>
      {editing && (
        <button className="btn sm" onClick={() => setItems((s) => [...s, { desc: '', size: '', grade: '', reqQty: 0, planQty: 0, loadQty: '', extra: true }])}>
          + Add another item
        </button>
      )}
      {changed && (
        <div className="form-grid">
          <Field label="Reason for change from plan *" span={2}>
            <input value={changeNote} placeholder="e.g. Party asked for 2 MT extra by phone / stock was low" onChange={(e) => setChangeNote(e.target.value)} />
          </Field>
        </div>
      )}

      <button className="btn primary" disabled={(delayMin > 0 && !reason.trim()) || !itemsOk || (changed && !changeNote.trim())} onClick={() => {
        const end = nowISO();
        const finalHrs = (new Date(end) - new Date(started)) / 3600000;
        const finalDelay = a.targetHours && finalHrs > a.targetHours ? Math.round((finalHrs - a.targetHours) * 60) : 0;
        updateAdvice(a.id, {
          stage: 'LOADED',
          items: items.map((i) => ({ ...i, loadQty: Number(i.loadQty) || 0 })),
          loading: { ...a.loading, end, delayMin: finalDelay, delayReason: finalDelay > 0 ? reason.trim() : '', endBy: who, changeNote: changed ? changeNote.trim() : '' },
        });
        done();
      }}>
        ■ End {act} (current time will be recorded) → Send to Final Weighment
      </button>
    </>
  );
}

/** Read-only record once loading/unloading has ended – kept visible on every later stage. */
function LoadingHistory({ a }) {
  const act = actOf(a);
  if (!a.loading?.end) return <div className="alert">{act} is not complete for this truck yet.</div>;
  const hrs = (new Date(a.loading.end) - new Date(a.loading.start)) / 3600000;
  return (
    <>
      <h4>{act} History</h4>
      <table className="kvt"><tbody>
        <tr><th>Start</th><td>{fmtDT(a.loading.start)} · {a.loading.by}</td></tr>
        <tr><th>End</th><td>{fmtDT(a.loading.end)} · {a.loading.endBy || a.loading.by}</td></tr>
        <tr><th>Total time</th><td>{hrs.toFixed(1)} hrs (target {a.targetHours} hrs)</td></tr>
        <tr><th>Delay</th><td>{a.loading.delayMin > 0 ? <span className="tone-red">{a.loading.delayMin} min – {a.loading.delayReason}</span> : 'No delay'}</td></tr>
        <tr><th>Qty</th><td>Plan {plannedTotal(a)} MT → Actual {loadedTotal(a)} MT</td></tr>
        {a.loading.changeNote && <tr><th>Item change</th><td><span className="tone-amber">{a.loading.changeNote}</span></td></tr>}
      </tbody></table>
      {a.items.some((i) => i.extra || (i.loadQty != null && Number(i.loadQty) !== Number(i.planQty))) && (
        <table className="tbl mini">
          <thead><tr><th>Item</th><th>Size</th><th>Plan (MT)</th><th>Actual (MT)</th></tr></thead>
          <tbody>
            {a.items.map((i, x) => (
              <tr key={x}>
                <td>{i.desc}{i.extra && <span className="badge amber" style={{ marginLeft: 6 }}>Extra</span>}</td><td>{i.size}</td>
                <td>{i.extra ? '—' : i.planQty}</td><td className={i.extra || Number(i.loadQty) !== Number(i.planQty) ? 'tone-amber' : ''}><b>{i.loadQty ?? i.planQty}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function LoadingPage({ sub }) {
  const L = labelsFor(sub);
  const started = (a) => !!a.loading?.start;
  return (
    <StagePage
      sub={sub} module="loading" title={L.act} subtitle={`${L.act} Supervisor – what to ${L.act.toLowerCase()} on the truck and the target hours.`}
      tabs={[
        {
          key: 'start', label: `${L.act} Start Pending`, stages: ['TARE_DONE'], filter: (a) => !started(a),
          title: `${L.act} Start`, Form: LoadForm,
        },
        {
          key: 'end', label: `${L.act} End Pending`, stages: ['TARE_DONE'], filter: started,
          title: `${L.act} End`, Form: LoadForm,
          statusOf: (a) => `Started ${fmtDT(a.loading.start)}`,
        },
        {
          key: 'history', label: 'History', stages: afterStage('TARE_DONE'),
          title: `${L.act} History`, Form: LoadingHistory, readOnly: true,
          statusOf: (a) => {
            const hrs = a.loading?.end ? ((new Date(a.loading.end) - new Date(a.loading.start)) / 3600000).toFixed(1) : '—';
            return a.loading?.delayMin > 0 ? `${hrs}h · Delay ${a.loading.delayMin}m` : `${hrs}h`;
          },
        },
      ]}
    />
  );
}

/* ═══════════ 6. Billing & Tax Invoice (Accounts) ═══════════ */
const BILL_CHECKS = ['Customer / Party', 'Order Quantity', 'Pending Order Quantity', 'Applicable Order Rate', 'Item and Size', 'Final Loading Quantity', 'Final Weight Slip', 'Statutory requirements & applicable taxes'];

function BillingForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'billing');
  const [c, setC] = useState({});
  const net = netOf(a);
  const exWorks = termsOf(a) === 'ex'; // Ex-Works: freight is paid by the party – not added to invoice
  const [f, setF] = useState({
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
      {a.loading?.delayMin > 0 && <div className="alert danger">{actOf(a)} delay: {a.loading.delayMin} min – {a.loading.delayReason}</div>}
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
        updateAdvice(a.id, {
          stage: 'BILLED',
          billing: {
            qty: n('qty'), rate: n('rate'), basic, gauge: n('gauge'), extra: n('extra'), freight: freightAmt, terms: termsOf(a), other: n('other'),
            taxable, gstPct: n('gstPct'), gstAmt, total,
            invoiceNo: f.invoiceNo.trim(), ewayBill: f.ewayBill.trim(), remark: f.remark.trim(), time: nowISO(), by: who,
          },
        });
        done();
      }}>
        Complete Billing → Send to Document Verification
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
      </tbody></table>
    </>
  );
}

export function BillingPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="billing" title="Billing" subtitle="Accounts / Billing – billing and tax invoice based on the final weighment."
      tabs={[
        { key: 'b', label: 'Billing Pending', stages: ['FINAL_DONE'], title: 'Billing & Tax Invoice Preparation', Form: BillingForm },
        { key: 'history', label: 'History', stages: afterStage('FINAL_DONE'), title: 'Billing History', Form: BillingHistory, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ 7. Document Verification (Dispatch) ═══════════ */
const DOC_CHECKS = ['Invoice details are correct', 'Vehicle number is correct', 'Quantity / weight is correct', 'E-Way Bill details are correct', 'Transport documents are available', 'Required approvals are completed', 'Documents stamped and signed'];

function DocVerifyForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'docverify');
  const [c, setC] = useState({});
  const [remark, setRemark] = useState('');
  const b = a.billing || {};
  const ok = DOC_CHECKS.every((x) => c[x]);
  return (
    <>
      <div className="alert info">
        Invoice <b>{b.invoiceNo}</b> · E-Way Bill <b>{b.ewayBill}</b> · Qty <b>{b.qty} MT</b> · Total <b>{rs(b.total)}</b> · Billing by {b.by}
      </div>
      {whoField}
      <div className="form-grid">
        <Field label="Remark" span={2}><input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
      </div>
      <h4>Dispatch Checklist</h4>
      <Checks items={DOC_CHECKS} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={() => {
        updateAdvice(a.id, { stage: 'DOC_OK', docVerify: { remark, time: nowISO(), by: who } });
        done();
      }}>
        Documents OK → Send to Gate Pass
      </button>
    </>
  );
}

/** Read-only record once documents are verified – kept visible on every later stage. */
function DocVerifyHistory({ a }) {
  if (!a.docVerify) return <div className="alert">Document verification is not done yet.</div>;
  return (
    <>
      <h4>Document Verification History</h4>
      <table className="kvt"><tbody>
        <tr><th>Verified</th><td>{fmtDT(a.docVerify.time)} · {a.docVerify.by}</td></tr>
        {a.docVerify.remark && <tr><th>Remark</th><td>{a.docVerify.remark}</td></tr>}
      </tbody></table>
    </>
  );
}

export function DocVerifyPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="docverify" title="Document Verification" subtitle="Dispatch – verify the Accounts documents using the dispatch checklist."
      tabs={[
        { key: 'v', label: 'Verification Pending', stages: ['BILLED'], title: 'Dispatch Document Verification', Form: DocVerifyForm },
        { key: 'history', label: 'History', stages: afterStage('BILLED'), title: 'Document Verification History', Form: DocVerifyHistory, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ 8. Gate Pass (Dispatch) ═══════════ */
// SOP "Complete Dispatch Document Set"
const DOC_SET = ['Final Tax Invoice', 'E-Way Bill', 'Transport Document / LR', 'Final Weight Slip', 'Loading Advice / Dispatch Advice', 'Other statutory or customer documents'];

function GatePassForm({ a, sub, done }) {
  const { updateAdvice, state } = useStore();
  const [who, whoField] = useIncharge(sub, 'gatepass');
  const [c, setC] = useState({});
  const seq = String(state.advices.filter((x) => x.dispatch).length + 1).padStart(4, '0');
  const gpNo = `GP-${new Date().getFullYear()}-${seq}`;
  const biltyNo = `LR-${new Date().getFullYear()}-${seq}`;
  const ok = DOC_SET.every((x) => c[x]);
  return (
    <>
      <div className="alert info">Documents are verified ({a.docVerify?.by}) · Invoice {a.billing?.invoiceNo} · E-Way {a.billing?.ewayBill}</div>
      <div className="alert ok">
        {sub === 'purchase'
          ? <>On generating, Gate Pass <b>{gpNo}</b> will be created (supplier Bilty <b>{a.gateIn?.biltyNo || '—'}</b> was recorded at Gate-In)</>
          : <>On generating, these will be created: Bilty No. <b>{biltyNo}</b> · Gate Pass <b>{gpNo}</b></>}
      </div>
      {whoField}
      <h4>Complete Dispatch Document Set (to hand over to Gate Security)</h4>
      <Checks items={DOC_SET} state={c} setState={setC} />
      <button className="btn primary" disabled={!ok} onClick={() => {
        updateAdvice(a.id, { stage: 'GATEPASS', dispatch: { time: nowISO(), by: who, gatePassNo: gpNo, ...(sub === 'sales' ? { biltyNo } : {}) } });
        done();
      }}>
        Generate Gate Pass → Send to Security Clearance
      </button>
    </>
  );
}

export function GatePassPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="gatepass" title="Gate Pass" subtitle="Dispatch – generate the gate pass and hand the document set to Gate Security."
      tabs={[
        { key: 'pending', label: 'Gate Pass Pending', stages: ['DOC_OK'], title: 'Gate Pass Generation', Form: GatePassForm },
        { key: 'history', label: 'History', stages: afterStage('DOC_OK'), title: 'Gate Pass History', readOnly: true, Form: ({ a }) => <GatePassSheet a={a} /> },
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

function GrnForm({ a, sub, done }) {
  const { updateAdvice, state } = useStore();
  const [who, whoField] = useIncharge(sub, 'grn');
  const [c, setC] = useState({});
  const net = netOf(a);
  const netMT = net != null ? net / 1000 : null;
  const [invoiceQty, setInvoiceQty] = useState(String(loadedTotal(a) || ''));
  const [quality, setQuality] = useState('Accepted');
  const [remark, setRemark] = useState('');
  const seq = String(state.advices.filter((x) => x.grn).length + 1).padStart(4, '0');
  const grnNo = `GRN-${new Date().getFullYear()}-${seq}`;
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
      <div className="alert ok">On saving, GRN No. <b>{grnNo}</b> will be created.</div>
      <button className="btn primary" disabled={!ok} onClick={() => {
        updateAdvice(a.id, {
          stage: 'CLEARED',
          grn: { grnNo, netQty: netMT, orderedQty: ordered, invoiceQty: Number(invoiceQty), quality, remark: remark.trim(), time: nowISO(), by: who },
        });
        done();
      }}>
        Save GRN → Send to Gate-Out (empty vehicle)
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
      </tbody></table>
    </>
  );
}

export function GrnPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="grn" title="Material Receipt (GRN)" subtitle="Store – receive the unloaded material after matching it with the PO and supplier invoice."
      tabs={[
        { key: 'g', label: 'GRN Pending', stages: ['FINAL_DONE'], title: 'Material Receipt (GRN)', Form: GrnForm },
        { key: 'history', label: 'History', stages: ['CLEARED', 'OUT'], title: 'GRN History', Form: GrnHistory, readOnly: true },
      ]}
    />
  );
}

/* ═══════════ 10. Gate-Out ═══════════ */
function GateOutForm({ a, sub, done }) {
  const { updateAdvice } = useStore();
  const [who, whoField] = useIncharge(sub, 'gateout');
  const [c, setC] = useState({});
  const purchase = a.type === 'purchase';
  const items = purchase
    ? ['Vehicle is completely empty (fully unloaded)', 'No material of ours remains in the vehicle', 'Details recorded in Gate-Out Register / System']
    : ['Details recorded in Gate-Out Register / System', 'No discrepancy found'];
  const ok = items.every((x) => c[x]);
  return (
    <>
      {purchase
        ? <div className="alert ok">✔ GRN is done ({a.grn?.grnNo} · {a.grn?.by}) · Empty vehicle Gate-Out</div>
        : <div className="alert ok">✔ Security clearance is done ({a.clearance?.by}) · Gate Pass {a.dispatch?.gatePassNo}</div>}
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
      </tbody></table>
    </>
  );
}

export function GateOutPage({ sub }) {
  return (
    <StagePage
      sub={sub} module="gateout" title="Gate-Out" subtitle="Vehicle release at the main gate and Gate-Out register entry."
      tabs={[
        { key: 'out', label: 'Gate-Out Pending', stages: ['CLEARED'], title: 'Gate-Out Record', Form: GateOutForm },
        { key: 'history', label: 'History', stages: afterStage('CLEARED'), title: 'Gate-Out History', Form: GateOutHistory, readOnly: true },
      ]}
    />
  );
}
