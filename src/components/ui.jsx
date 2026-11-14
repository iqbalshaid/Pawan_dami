import React, { useState } from 'react';
import { STAGES, actOf, labelsFor, stageLabel, termsOf, termsText, weBearFreight } from '../data.js';

export const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
// Purchase: supplier's bilty arrives with the truck, recorded at Gate-In. Sales: generated at Dispatch OK.
export const biltyOf = (a) => (a.type === 'purchase' ? a.gateIn?.biltyNo : a.dispatch?.biltyNo) || '';
export const biltyPending = (a) => (a.type === 'purchase' ? 'Gate-In par milegi' : 'Dispatch me banegi');
export const kg =(n) => (n || n === 0 ? Number(n).toLocaleString('en-IN') + ' kg' : '—');
// Net weight is known only when both weights were entered manually (photo-only slips carry no number).
export const netOf = (a) =>
  typeof a.final?.weight === 'number' && typeof a.tare?.weight === 'number' ? Math.abs(a.final.weight - a.tare.weight) : null;
export const netText = (a) => (netOf(a) != null ? kg(netOf(a)) : 'Slip photo dekho');
const wtText = (r) => (!r ? '—' : r.method === 'photo' ? 'Slip photo' : kg(r.weight));
export const plannedTotal = (a) => a.items.reduce((s, i) => s + Number(i.planQty || 0), 0);
// What actually went on / came off the truck: `loadQty` is set at Loading/Unloading end (edited items,
// extra items added there have planQty 0). Before that it is the plan.
export const hasLoadQty = (a) => a.items.some((i) => i.loadQty != null);
export const loadedTotal = (a) => Math.round(a.items.reduce((s, i) => s + Number(i.loadQty ?? i.planQty ?? 0), 0) * 1000) / 1000;
export const materialText = (a) =>
  a.items.length ? a.items.map((i) => `${i.desc} ${i.size}`.trim()).join(', ') : '—';

// TARE_DONE's label depends on this specific truck's purpose (loading vs unloading),
// not the subsystem, so Badge takes the whole advice rather than just stage+type.
export function Badge({ a }) {
  const s = STAGES[a.stage];
  const label = a.stage === 'TARE_DONE' ? actOf(a) : stageLabel(a.stage, a.type);
  return <span className={`badge ${s.tone}`}>{label}</span>;
}

export function Modal({ title, onClose, children, wide, footer }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, span = 1, hint }) {
  return (
    <label className="field" style={{ gridColumn: `span ${span}` }}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

export function PageHead({ title, sub, right }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div>{right}</div>
    </div>
  );
}

/** Photo upload OR manual entry – value is a dataURL string ('' when none) */
export function PhotoInput({ value, onChange }) {
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => onChange(r.result);
    r.readAsDataURL(f);
  };
  return (
    <div className="photo">
      {value ? (
        <div className="photo-prev">
          <img src={value} alt="slip" />
          <button type="button" className="btn ghost sm" onClick={() => onChange('')}>Remove</button>
        </div>
      ) : (
        <input type="file" accept="image/*" capture="environment" onChange={pick} />
      )}
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="kv">
    <span>{k}</span>
    <b>{v || '—'}</b>
  </div>
);

/** Read-only detail of an advice – used inside all modals */
export function AdviceSummary({ a, compact }) {
  const L = labelsFor(a.type);
  const act = actOf(a);
  const total = plannedTotal(a);
  return (
    <div className="summary">
      <div className="sum-top">
        <div>
          <div className="muted">{L.advice}</div>
          <div className="big">{a.no}</div>
        </div>
        <div className="truck">{a.transport.vehicle || '—'}</div>
        <Badge a={a} />
      </div>

      <div className="route">
        <div><small>{L.from}</small><b>{a.transport.from || '—'}</b></div>
        <span>➜</span>
        <div><small>{L.to}</small><b>{a.transport.to || '—'}</b></div>
      </div>

      <div className="grid2">
        <Row k={L.party} v={a.party} />
        <Row k="Order Ref" v={a.orderRef} />
        <Row k="Transporter" v={a.transport.name} />
        <Row k="Driver" v={[a.transport.driver, a.transport.mobile].filter(Boolean).join(' · ')} />
        <Row k="Required Qty" v={a.reqQty ? `${a.reqQty} MT` : ''} />
        <Row k={`Planned ${act} Qty`} v={total ? `${total} MT` : ''} />
        <Row k="Target Time" v={a.targetHours ? `${a.targetHours} hours` : ''} />
        <Row k="Bilty / LR No." v={biltyOf(a) || biltyPending(a)} />
        <Row k="Freight Terms" v={`${termsText(a.type, termsOf(a))}${weBearFreight(a) && a.freight ? ` · ₹ ${Number(a.freight).toLocaleString('en-IN')}` : ''}`} />
        <Row k="Billing Party" v={a.billingInfo?.party} />
        <Row k="GST No." v={a.billingInfo?.gst} />
      </div>

      <h4>Material to {act === 'Loading' ? 'load' : 'unload'}</h4>
      <table className="tbl mini">
        <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Req (MT)</th><th>Plan (MT)</th>{hasLoadQty(a) && <th>{act === 'Loading' ? 'Loaded' : 'Unloaded'} (MT)</th>}</tr></thead>
        <tbody>
          {a.items.map((i, x) => (
            <tr key={x}>
              <td>{i.desc}{i.extra && <span className="badge amber" style={{ marginLeft: 6 }}>Extra</span>}</td><td>{i.size}</td><td>{i.grade}</td><td>{i.reqQty}</td><td>{i.planQty}</td>
              {hasLoadQty(a) && <td className={Number(i.loadQty) !== Number(i.planQty) ? 'tone-amber' : ''}><b>{i.loadQty ?? i.planQty}</b></td>}
            </tr>
          ))}
        </tbody>
      </table>

      {!compact && (
        <>
          {Object.values(a.remarks || {}).some(Boolean) && (
            <div className="notes">
              {a.remarks.special && <p><b>Special size/remarks:</b> {a.remarks.special}</p>}
              {a.remarks.customer && <p><b>Customer requirement:</b> {a.remarks.customer}</p>}
              {a.remarks.packing && <p><b>Packing/bundling:</b> {a.remarks.packing}</p>}
              {a.remarks.handling && <p><b>Handling:</b> {a.remarks.handling}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Step history */
export function Timeline({ a }) {
  const act = actOf(a);
  const net = netOf(a);
  const steps = [
    { t: `Advice (${a.no}) created`, time: a.date, by: '', done: true },
    { t: `Verification – Gate-In${a.type === 'purchase' && a.gateIn?.biltyNo ? ` · Bilty ${a.gateIn.biltyNo}` : ''}`, time: a.gateIn?.time, by: a.gateIn?.by, done: !!a.gateIn },
    { t: `1st Weighment (${a.type === 'purchase' ? 'bhari gaadi' : 'khaali gaadi'}) – ${wtText(a.tare)}`, time: a.tare?.time, by: a.tare?.by, note: a.tare?.remark, img: a.tare?.photo, done: !!a.tare },
    { t: `${act} ${a.loading?.end ? `(${fmtDT(a.loading.start)} → ${fmtDT(a.loading.end)})` : a.loading?.start ? `(started ${fmtDT(a.loading.start)}, in progress)` : ''}`, time: a.loading?.end, by: a.loading?.endBy || a.loading?.by, note: a.loading?.delayMin > 0 ? `Delay ${a.loading.delayMin} min – ${a.loading.delayReason}` : '', red: a.loading?.delayMin > 0, done: !!a.loading?.end },
    { t: `Final Weighment (${a.type === 'purchase' ? 'khaali gaadi' : 'bhari gaadi'}) – ${wtText(a.final)}${net != null ? ` · Net ${kg(net)}` : ''}`, time: a.final?.time, by: a.final?.by, note: a.final?.remark, img: a.final?.photo, done: !!a.final },
    ...(a.type === 'purchase'
      ? [
          { t: `Material Receipt (GRN)${a.grn ? ` ${a.grn.grnNo} · ${a.grn.quality}` : ''}`, time: a.grn?.time, by: a.grn?.by, note: a.grn?.remark, done: !!a.grn },
          { t: 'Gate-Out (khaali gaadi)', time: a.gateOut?.time, by: a.gateOut?.by, done: !!a.gateOut },
        ]
      : [
          { t: `Billing${a.billing ? ` · Invoice ${a.billing.invoiceNo} · E-Way ${a.billing.ewayBill}` : ''}`, time: a.billing?.time, by: a.billing?.by, note: a.billing?.remark, done: !!a.billing },
          { t: 'Document Verification', time: a.docVerify?.time, by: a.docVerify?.by, note: a.docVerify?.remark, done: !!a.docVerify },
          { t: `Gate Pass${a.dispatch ? ` ${a.dispatch.gatePassNo}${biltyOf(a) ? ` · Bilty ${biltyOf(a)}` : ''}` : ''}`, time: a.dispatch?.time, by: a.dispatch?.by, done: !!a.dispatch },
          { t: 'Security Clearance', time: a.clearance?.time, by: a.clearance?.by, done: !!a.clearance },
          { t: 'Gate-Out (Vehicle Released)', time: a.gateOut?.time, by: a.gateOut?.by, done: !!a.gateOut },
        ]),
  ];
  const [zoom, setZoom] = useState(null);
  return (
    <>
      <ol className="timeline">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? 'done' : ''}>
            <div className="dot" />
            <div>
              <b>{s.t}</b>
              <div className="muted">{s.done ? `${fmtDT(s.time)}${s.by ? ' · ' + s.by : ''}` : 'Pending'}</div>
              {s.note && <div className={`note${s.red ? ' red' : ''}`}>“{s.note}”</div>}
              {s.img && <img className="thumb" src={s.img} alt="slip" onClick={() => setZoom(s.img)} />}
            </div>
          </li>
        ))}
      </ol>
      {zoom && (
        <Modal title="Weighment slip" onClose={() => setZoom(null)}>
          <img src={zoom} alt="slip" style={{ maxWidth: '100%' }} />
        </Modal>
      )}
    </>
  );
}
