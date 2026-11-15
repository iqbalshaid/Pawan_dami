import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { labelsFor, termsText } from '../data.js';
import { AdviceSummary, Badge, Empty, Field, Modal, PageHead, Timeline, biltyOf, biltyPending, fmtDT, materialText, plannedTotal } from '../components/ui.jsx';

const emptyItem = { desc: '', size: '', grade: '', reqQty: '', planQty: '' };
const blank = (sub) => ({
  purpose: sub === 'purchase' ? 'unloading' : 'loading',
  party: '', acName: '', orderRef: '', rate: '', reqQty: '',
  billingInfo: { party: '', address: '', gst: '', instr: '' },
  transport: { name: '', vehicle: '', driver: '', mobile: '', from: sub === 'sales' ? 'Urla, Raipur' : '', to: sub === 'sales' ? '' : 'Urla, Raipur' },
  items: [{ ...emptyItem }],
  remarks: { special: '', customer: '', packing: '', handling: '' },
  targetHours: 2, freight: '',
  // Sales default FOR (hum pahunchate hain); Purchase default FOR (supplier pahunchata hai)
  freightTerms: 'for',
});

export function InventoryPage({ sub }) {
  const { state, can } = useStore();
  const L = labelsFor(sub);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const rows = state.advices.filter((a) => a.type === sub).filter((a) =>
    !q || [a.no, a.party, a.transport.vehicle, a.transport.name].join(' ').toLowerCase().includes(q.toLowerCase())
  );
  const sel = view && state.advices.find((a) => a.id === view);

  return (
    <>
      <PageHead
        title={`${sub === 'sales' ? 'Sales' : 'Purchase'} · ${L.advice}`}
        sub={sub === 'purchase' ? `${L.advice} banao – supplier ki Bilty (LR) Gate-In par record hogi.` : `${L.advice} banao – Bilty (LR) number Dispatch OK ke time banega.`}
        right={can(sub, 'inventory', 'create') && <button className="btn primary" onClick={() => setCreating(true)}>+ Create {L.advice}</button>}
      />
      <div className="card">
        <div className="toolbar"><input placeholder="Search advice / party / truck / transporter…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {rows.length === 0 ? <Empty text="Koi record nahi mila." /> : (
          <table className="tbl">
            <thead><tr><th>Advice</th><th>{L.party}</th><th>Material</th><th>Plan Qty</th><th>Truck</th><th>Transporter</th><th>Bilty</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.no}</b><div className="muted">{fmtDT(a.date)}</div></td>
                  <td>{a.party}</td>
                  <td className="clip">{materialText(a)}</td>
                  <td>{plannedTotal(a)} MT</td>
                  <td><span className="truck sm">{a.transport.vehicle}</span></td>
                  <td>{a.transport.name}</td>
                  <td>{biltyOf(a) || <span className="muted">{biltyPending(a)}</span>}</td>
                  <td><Badge a={a} /></td>
                  <td><button className="btn sm" onClick={() => setView(a.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sel && (
        <Modal title={`${sel.no} – Details`} wide onClose={() => setView(null)}>
          <AdviceSummary a={sel} />
          <h4>Progress</h4>
          <Timeline a={sel} />
        </Modal>
      )}
      {creating && <CreateModal sub={sub} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateModal({ sub, onClose }) {
  const { createAdvice } = useStore();
  const L = labelsFor(sub);
  const [f, setF] = useState(blank(sub));
  const act = L.act; // Sales = Loading, Purchase = Unloading
  // does the freight cost sit with us? (Sales FOR / Purchase EX)
  const weBear = sub === 'purchase' ? f.freightTerms === 'ex' : f.freightTerms === 'for';
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const nest = (g, k, v) => setF((s) => ({ ...s, [g]: { ...s[g], [k]: v } }));
  const setItem = (i, k, v) => setF((s) => ({ ...s, items: s.items.map((it, x) => (x === i ? { ...it, [k]: v } : it)) }));
  const valid = f.party && f.orderRef && f.transport.vehicle && f.transport.name && f.items.every((i) => i.desc && i.planQty);

  const save = () => {
    const advice = createAdvice(sub, {
      ...f, rate: Number(f.rate) || 0, reqQty: Number(f.reqQty) || 0,
      // bhada amount sirf tab jab uska kharcha hamare side ho
      freight: weBear ? Number(f.freight) || 0 : 0,
      items: f.items.map((i) => ({ ...i, reqQty: Number(i.reqQty) || 0, planQty: Number(i.planQty) || 0 })),
    });
    // bilty is auto-generated with the advice
    advice && onClose();
  };

  const I = (label, value, onChange, props = {}, span = 1) => (
    <Field label={label} span={span}><input value={value} onChange={(e) => onChange(e.target.value)} {...props} /></Field>
  );

  return (
    <Modal title={`Create ${L.advice}`} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Create Advice</button></>}>
      <h4>1. {L.party} Details</h4>
      <div className="form-grid">
        {I(`${L.party} / Party Name *`, f.party, (v) => set('party', v))}
        {I('A/c Name', f.acName, (v) => set('acName', v))}
        {I(sub === 'purchase' ? 'PO / Order Ref *' : 'Sales Order Ref *', f.orderRef, (v) => set('orderRef', v))}
        {I('Rate (₹/MT)', f.rate, (v) => set('rate', v), { type: 'number' })}
        {I('Required Quantity (MT)', f.reqQty, (v) => set('reqQty', v), { type: 'number' })}
      </div>

      <h4>2. Billing Details</h4>
      <div className="form-grid">
        {I('Billing Party', f.billingInfo.party, (v) => nest('billingInfo', 'party', v))}
        {I('GST No.', f.billingInfo.gst, (v) => nest('billingInfo', 'gst', v))}
        {I('Billing Address', f.billingInfo.address, (v) => nest('billingInfo', 'address', v), {}, 2)}
        {I('Applicable billing instructions', f.billingInfo.instr, (v) => nest('billingInfo', 'instr', v), {}, 2)}
      </div>

      <h4>3. Transport Details</h4>
      <div className="form-grid">
        {I('Transporter Name *', f.transport.name, (v) => nest('transport', 'name', v))}
        {I('Vehicle Number *', f.transport.vehicle, (v) => nest('transport', 'vehicle', v.toUpperCase()), { placeholder: 'CG04 AB 1234' })}
        {I('Driver Name', f.transport.driver, (v) => nest('transport', 'driver', v))}
        {I('Driver Mobile', f.transport.mobile, (v) => nest('transport', 'mobile', v))}
        {I(L.from, f.transport.from, (v) => nest('transport', 'from', v))}
        {I(L.to, f.transport.to, (v) => nest('transport', 'to', v))}
        <Field label="Freight Terms (EX / FOR) *" hint={weBear ? 'Bhada hamare side – amount neeche daalo' : 'Bhada dusri party ka – invoice/bilty me amount nahi judega'}>
          <select value={f.freightTerms} onChange={(e) => set('freightTerms', e.target.value)}>
            <option value="ex">{termsText(sub, 'ex')}</option>
            <option value="for">{termsText(sub, 'for')}</option>
          </select>
        </Field>
        {weBear
          ? I('Freight / Bhada (₹)', f.freight, (v) => set('freight', v), { type: 'number' })
          : <Field label="Freight / Bhada (₹)"><input value="Dusri party ka – nahi bharna" disabled /></Field>}
        {I(`Target ${act} time (hours)`, f.targetHours, (v) => set('targetHours', v), { type: 'number', step: '0.5' })}
      </div>

      <h4>4. Item-wise {act} Details</h4>
      <table className="tbl mini">
        <thead><tr><th>Item Description *</th><th>Size</th><th>Grade / Spec</th><th>Required (MT)</th><th>Planned (MT) *</th><th /></tr></thead>
        <tbody>
          {f.items.map((it, i) => (
            <tr key={i}>
              {['desc', 'size', 'grade', 'reqQty', 'planQty'].map((k) => (
                <td key={k}><input type={k.endsWith('Qty') ? 'number' : 'text'} value={it[k]} onChange={(e) => setItem(i, k, e.target.value)} /></td>
              ))}
              <td>{f.items.length > 1 && <button className="icon-btn" onClick={() => set('items', f.items.filter((_, x) => x !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" onClick={() => set('items', [...f.items, { ...emptyItem }])}>+ Add item</button>

      <h4>5. Special Size / Remarks</h4>
      <div className="form-grid">
        {I('Special sizes', f.remarks.special, (v) => nest('remarks', 'special', v))}
        {I('Customer-specific requirements', f.remarks.customer, (v) => nest('remarks', 'customer', v))}
        {I('Packing / bundling instructions', f.remarks.packing, (v) => nest('remarks', 'packing', v))}
        {I('Special loading / handling instructions', f.remarks.handling, (v) => nest('remarks', 'handling', v))}
      </div>
    </Modal>
  );
}
