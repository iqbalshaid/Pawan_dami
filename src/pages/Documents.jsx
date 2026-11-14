import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { labelsFor, termsOf, termsText, weBearFreight } from '../data.js';
import { Empty, Modal, PageHead, biltyOf, biltyPending, fmtDT, netText, materialText, plannedTotal } from '../components/ui.jsx';

// Bilty freight cell: amount when the cost is on our side, otherwise just the terms.
const freightText = (a) =>
  weBearFreight(a) ? `₹ ${Number(a.freight || 0).toLocaleString('en-IN')} (${termsOf(a).toUpperCase()})` : `${termsOf(a).toUpperCase()} – ${termsText(a.type, termsOf(a)).split('– ')[1]}`;


const Sheet = ({ title, children }) => (
  <div className="sheet">
    <div className="sheet-head">
      <b>M/s Pawan Putra Tubes</b>
      <span>Urla Guma Road, Borjhara, Urla, Raipur, Chhattisgarh</span>
      <h2>{title}</h2>
    </div>
    {children}
    <button className="btn primary no-print" onClick={() => window.print()}>🖨 Print</button>
  </div>
);
const KV = ({ k, v }) => <tr><th>{k}</th><td>{v || '—'}</td></tr>;

export function BiltyPage({ sub }) {
  const { state } = useStore();
  const L = labelsFor(sub);
  const [sel, setSel] = useState(null);
  const rows = state.advices.filter((a) => a.type === sub);
  const a = sel && rows.find((x) => x.id === sel);
  const lr = (x) => biltyOf(x) || 'Pending';
  return (
    <>
      <PageHead title="Sales · Bilty / LR" sub="Gate Pass ke saath bilty number generate hota hai; Security Clearance par ye match kiya jaata hai." />
      <div className="card">
        {rows.length === 0 ? <Empty text="Koi bilty nahi." /> : (
          <table className="tbl">
            <thead><tr><th>LR No.</th><th>Date</th><th>Transporter</th><th>Truck</th><th>Route</th><th>Freight</th><th /></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td>{biltyOf(x) ? <b>{lr(x)}</b> : <span className="badge gray">{biltyPending(x)}</span>}</td><td>{fmtDT(x.dispatch?.time) || fmtDT(x.date)}</td><td>{x.transport.name}</td>
                  <td><span className="truck sm">{x.transport.vehicle}</span></td>
                  <td>{x.transport.from} ➜ {x.transport.to}</td><td>{freightText(x)}</td>
                  <td><button className="btn sm" onClick={() => setSel(x.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {a && (
        <Modal title={`Bilty ${lr(a)}`} onClose={() => setSel(null)}>
          <Sheet title="Transport Bilty / Lorry Receipt">
            <table className="kvt"><tbody>
              <KV k="LR No." v={lr(a)} />
              <KV k="Date" v={fmtDT(a.date)} />
              <KV k="Advice Ref" v={a.no} />
              <KV k="Transporter" v={a.transport.name} /><KV k="Vehicle No." v={a.transport.vehicle} />
              <KV k="Driver" v={`${a.transport.driver} ${a.transport.mobile}`} />
              <KV k="From" v={a.transport.from} /><KV k="To" v={a.transport.to} />
              <KV k={L.party} v={a.party} /><KV k="Material" v={materialText(a)} />
              <KV k="Planned Qty" v={`${plannedTotal(a)} MT`} />
              <KV k="Freight Terms" v={termsText(a.type, termsOf(a))} />
              <KV k="Freight" v={freightText(a)} />
            </tbody></table>
          </Sheet>
        </Modal>
      )}
    </>
  );
}

/** Printable gate pass – shown inside the Gate Pass step's "Issued" tab. */
export function GatePassSheet({ a }) {
  if (!a.dispatch) return null;
  return (
    <Sheet title="Gate Pass">
      <table className="kvt"><tbody>
        <KV k="Gate Pass No." v={a.dispatch.gatePassNo} /><KV k="Bilty / LR No." v={biltyOf(a)} /><KV k="Date" v={fmtDT(a.dispatch.time)} /><KV k="Advice" v={a.no} />
        <KV k="Party" v={a.party} /><KV k="Vehicle No." v={a.transport.vehicle} /><KV k="Transporter" v={a.transport.name} />
        <KV k="Material" v={materialText(a)} /><KV k="Net Weight" v={netText(a)} />
        <KV k="Invoice No." v={a.billing?.invoiceNo} /><KV k="E-Way Bill" v={a.billing?.ewayBill} />
        <KV k="Invoice Value" v={a.billing ? '₹ ' + Math.round(a.billing.total).toLocaleString('en-IN') : ''} />
        <KV k="Destination" v={a.transport.to} /><KV k="Issued by" v={a.dispatch.by} />
      </tbody></table>
    </Sheet>
  );
}
