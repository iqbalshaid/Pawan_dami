import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { INDENT_STATUS, orderProgress, termsText } from '../data.js';
import { Empty, Field, Modal, PageHead, fmtDT } from '../components/ui.jsx';

// Sales → Sales Order (customer order, single page). Purchase → Indent → Approval → PO (three pages, below).
// When creating an advice, party / items / rate can be filled from these records.
export const OrderPage = () => <SalesOrderPage />;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const inr = (n) => '₹ ' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const qtyOf = (o) => o.items.reduce((s, i) => s + Number(i.qty || 0), 0);
const itemsText = (o) => o.items.map((i) => `${i.desc} ${i.size}`.trim()).join(', ') || '—';
const today = () => new Date().toISOString().slice(0, 10);

const Row = ({ k, v }) => (
  <div className="kv"><span>{k}</span><b>{v || '—'}</b></div>
);

const emptyLine = { desc: '', size: '', grade: '', qty: '', rate: '' };

/** Editable item rows shared by both forms. `cols` = [key, label, type][] */
function ItemTable({ items, cols, onChange }) {
  const setItem = (i, k, v) => onChange(items.map((it, x) => (x === i ? { ...it, [k]: v } : it)));
  return (
    <>
      <table className="tbl mini">
        <thead><tr>{cols.map(([k, label]) => <th key={k}>{label}</th>)}<th /></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              {cols.map(([k, , type]) => (
                <td key={k}><input type={type || 'text'} value={it[k]} onChange={(e) => setItem(i, k, e.target.value)} /></td>
              ))}
              <td>{items.length > 1 && <button className="icon-btn" onClick={() => onChange(items.filter((_, x) => x !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" onClick={() => onChange([...items, { ...emptyLine }])}>+ Add item</button>
    </>
  );
}

// ─────────────────────────────── Sales Order ───────────────────────────────

const ORDER_TONE = { Open: 'gray', 'Partly Planned': 'amber', 'Fully Planned': 'blue', 'Partly Dispatched': 'purple', Completed: 'green' };
// Until approved, a Sales Order shows its approval state; after that, its dispatch progress.
const SO_APPROVAL = { pending: ['Pending Approval', 'amber'], rejected: ['Rejected', 'gray'] };
const soStatus = (o, p) => SO_APPROVAL[o.status] || [p.status, ORDER_TONE[p.status]];
const SoBadge = ({ o, p }) => { const [label, tone] = soStatus(o, p); return <span className={`badge ${tone}`}>{label}</span>; };

export function OrderApprovalPage() {
  const { state, can } = useStore();
  const tabs = [
    { key: 'pending', label: 'Pending Approval', match: (o) => o.status === 'pending' },
    { key: 'done', label: 'History', match: (o) => o.status !== 'pending' },
  ];
  const [tabKey, setTabKey] = useState('pending');
  const [view, setView] = useState(null); // { id, act }
  const tab = tabs.find((t) => t.key === tabKey);
  const all = state.orders.filter((o) => o.type === 'sales');
  const rows = all.filter(tab.match);
  const canAct = tabKey === 'pending' && can('sales', 'orderapproval', 'action');
  const sel = view && state.orders.find((o) => o.id === view.id);

  return (
    <>
      <PageHead title="Sales · Order Approval" sub="Review the rate, party and payment terms of new Sales Orders, then Approve or Reject. A Loading Advice can be created only for approved orders." />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={t.key === tabKey ? 'on' : ''} onClick={() => setTabKey(t.key)}>
            {t.label}<i>{all.filter(t.match).length}</i>
          </button>
        ))}
      </div>
      <div className="card">
        {rows.length === 0 ? <Empty text="No orders found." /> : (
          <table className="tbl">
            <thead><tr><th>SO No.</th><th>Customer</th><th>Material</th><th>Qty</th><th>Value</th><th>Payment Terms</th><th>Created By</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><b>{o.no}</b><div className="muted">{fmtDate(o.date)}</div></td>
                  <td>{o.party}</td>
                  <td className="clip">{itemsText(o)}</td>
                  <td>{qtyOf(o)} MT</td>
                  <td>{inr(o.items.reduce((s, i) => s + i.qty * i.rate, 0))}</td>
                  <td>{o.paymentTerms || '—'}</td>
                  <td>{o.by}</td>
                  <td><SoBadge o={o} p={orderProgress(o, state.advices)} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setView({ id: o.id, act: false })}>View</button>{' '}
                    {canAct && <button className="btn sm primary" onClick={() => setView({ id: o.id, act: true })}>Action</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && <SalesOrderView o={sel} approve={view.act} onClose={() => setView(null)} />}
    </>
  );
}

function SalesOrderPage() {
  const { state, can } = useStore();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const rows = state.orders.filter((o) => o.type === 'sales').filter((o) =>
    !q || [o.no, o.party, o.salesPerson, itemsText(o)].join(' ').toLowerCase().includes(q.toLowerCase())
  );
  const sel = view && state.orders.find((o) => o.id === view);

  return (
    <>
      <PageHead
        title="Sales · Sales Order"
        sub="Enter the customer order here. When creating a Loading Advice, select this Sales Order to fill in party, items and rate automatically."
        right={can('sales', 'order', 'create') && <button className="btn primary" onClick={() => setCreating(true)}>+ Create Sales Order</button>}
      />
      <div className="card">
        <div className="toolbar"><input placeholder="Search SO no. / customer / item…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {rows.length === 0 ? <Empty text="No Sales Orders found." /> : (
          <table className="tbl">
            <thead><tr><th>SO No.</th><th>Customer</th><th>Material</th><th>Order Qty</th><th>Advice Qty</th><th>Dispatched</th><th>Delivery By</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((o) => {
                const p = orderProgress(o, state.advices);
                return (
                  <tr key={o.id}>
                    <td><b>{o.no}</b><div className="muted">{fmtDate(o.date)}</div></td>
                    <td>{o.party}</td>
                    <td className="clip">{itemsText(o)}</td>
                    <td>{p.ordered} MT</td>
                    <td>{p.planned} MT</td>
                    <td>{p.dispatched} MT</td>
                    <td>{fmtDate(o.deliveryDate)}</td>
                    <td><SoBadge o={o} p={p} /></td>
                    <td><button className="btn sm" onClick={() => setView(o.id)}>View</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {sel && <SalesOrderView o={sel} onClose={() => setView(null)} />}
      {creating && <SalesOrderForm onClose={() => setCreating(false)} />}
    </>
  );
}

/** `approve` = show Approve / Reject (Order Approval page, pending order). */
function SalesOrderView({ o, onClose, approve }) {
  const { state, updateOrder, user } = useStore();
  const [remark, setRemark] = useState('');
  const p = orderProgress(o, state.advices);
  const basic = o.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.rate || 0), 0);
  const approving = approve && o.status === 'pending';
  const decide = (status) => { updateOrder(o.id, { status, approval: { by: user.name, time: new Date().toISOString(), remark } }); onClose(); };
  return (
    <Modal title={`${o.no} – Sales Order`} wide onClose={onClose}
      footer={approving ? (
        <><button className="btn danger" onClick={() => decide('rejected')}>Reject</button><button className="btn primary" onClick={() => decide('approved')}>Approve</button></>
      ) : null}>
      <div className="grid2">
        <Row k="Order Date" v={fmtDate(o.date)} />
        <Row k="Status" v={soStatus(o, p)[0]} />
        <Row k="Customer" v={o.party} />
        <Row k="A/c Name" v={o.acName} />
        <Row k="Customer PO / Ref" v={o.custRef} />
        <Row k="Sales Person" v={o.salesPerson} />
        <Row k="Billing Party" v={o.billingInfo.party} />
        <Row k="GST No." v={o.billingInfo.gst} />
        <Row k="Billing Address" v={o.billingInfo.address} />
        <Row k="Ship To / Destination" v={o.shipTo} />
        <Row k="Freight Terms" v={termsText('sales', o.freightTerms)} />
        <Row k="Delivery By" v={fmtDate(o.deliveryDate)} />
        <Row k="Payment Terms" v={o.paymentTerms} />
        <Row k="Created By" v={o.by} />
      </div>
      <h4>Items</h4>
      <table className="tbl mini">
        <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Qty (MT)</th><th>Rate (₹/MT)</th><th>Amount</th></tr></thead>
        <tbody>
          {o.items.map((i, x) => (
            <tr key={x}><td>{i.desc}</td><td>{i.size}</td><td>{i.grade}</td><td>{i.qty}</td><td>{Number(i.rate || 0).toLocaleString('en-IN')}</td><td>{inr(i.qty * i.rate)}</td></tr>
          ))}
          <tr><td colSpan={3}><b>Total (before GST / freight)</b></td><td><b>{qtyOf(o)}</b></td><td /><td><b>{inr(basic)}</b></td></tr>
        </tbody>
      </table>
      {o.remarks && <div className="notes"><p><b>Remarks:</b> {o.remarks}</p></div>}
      {o.approval && (
        <div className={`alert ${o.status === 'rejected' ? 'warn' : 'ok'}`}>
          {o.status === 'rejected' ? 'Rejected' : 'Approved'} by <b>{o.approval.by}</b> · {fmtDT(o.approval.time)}{o.approval.remark ? ` – “${o.approval.remark}”` : ''}
        </div>
      )}
      {approving && (
        <div className="form-grid">
          <Field label="Approval / rejection remark" span={2}><input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Rate is fine / dispatch after advance is received" /></Field>
        </div>
      )}
      <h4>Advices against this order</h4>
      {p.advices.length === 0 ? <Empty text="No Loading Advice created yet." /> : (
        <table className="tbl mini">
          <thead><tr><th>Advice</th><th>Truck</th><th>Plan (MT)</th><th>Gate-Out</th></tr></thead>
          <tbody>
            {p.advices.map((a) => (
              <tr key={a.id}><td>{a.no}</td><td>{a.transport.vehicle}</td><td>{a.items.reduce((s, i) => s + Number(i.planQty || 0), 0)}</td><td>{a.gateOut ? fmtDT(a.gateOut.time) : 'Pending'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function SalesOrderForm({ onClose }) {
  const { createOrder, user } = useStore();
  const [f, setF] = useState({
    date: today(), party: '', acName: '', custRef: '', salesPerson: user.name,
    billingInfo: { party: '', address: '', gst: '' }, shipTo: '',
    items: [{ ...emptyLine }], freightTerms: 'for', deliveryDate: '', paymentTerms: '', remarks: '',
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const nest = (k, v) => setF((s) => ({ ...s, billingInfo: { ...s.billingInfo, [k]: v } }));
  const valid = f.party && f.date && f.items.every((i) => i.desc && Number(i.qty) > 0);
  const total = f.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  const save = () => {
    createOrder('sales', {
      ...f,
      billingInfo: { ...f.billingInfo, party: f.billingInfo.party || f.party },
      items: f.items.map((i) => ({ ...i, qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 })),
      by: user.name, status: 'pending', // goes to Order Approval first
    });
    onClose();
  };
  const I = (label, value, onChange, props = {}, span = 1) => (
    <Field label={label} span={span}><input value={value} onChange={(e) => onChange(e.target.value)} {...props} /></Field>
  );

  return (
    <Modal title="Create Sales Order" wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Save Sales Order</button></>}>
      <p className="muted">The SO number is generated automatically on save. After saving, the order goes to Order Approval.</p>
      <h4>1. Customer Details</h4>
      <div className="form-grid">
        {I('Order Date *', f.date, (v) => set('date', v), { type: 'date' })}
        {I('Customer / Party Name *', f.party, (v) => set('party', v))}
        {I('A/c Name', f.acName, (v) => set('acName', v))}
        {I('Customer PO / Reference No.', f.custRef, (v) => set('custRef', v))}
        {I('Sales Person', f.salesPerson, (v) => set('salesPerson', v))}
      </div>

      <h4>2. Billing & Delivery</h4>
      <div className="form-grid">
        {I('Billing Party', f.billingInfo.party, (v) => nest('party', v), { placeholder: 'Leave blank to use the customer name' })}
        {I('GST No.', f.billingInfo.gst, (v) => nest('gst', v.toUpperCase()))}
        {I('Billing Address', f.billingInfo.address, (v) => nest('address', v), {}, 2)}
        {I('Ship To / Destination', f.shipTo, (v) => set('shipTo', v), {}, 2)}
        <Field label="Freight Terms (EX / FOR)">
          <select value={f.freightTerms} onChange={(e) => set('freightTerms', e.target.value)}>
            <option value="ex">{termsText('sales', 'ex')}</option>
            <option value="for">{termsText('sales', 'for')}</option>
          </select>
        </Field>
        {I('Delivery By', f.deliveryDate, (v) => set('deliveryDate', v), { type: 'date' })}
        {I('Payment Terms', f.paymentTerms, (v) => set('paymentTerms', v), { placeholder: 'e.g. 30 days credit / Advance' }, 2)}
      </div>

      <h4>3. Items</h4>
      <ItemTable
        items={f.items}
        onChange={(v) => set('items', v)}
        cols={[['desc', 'Item Description *'], ['size', 'Size'], ['grade', 'Grade / Spec'], ['qty', 'Qty (MT) *', 'number'], ['rate', 'Rate (₹/MT)', 'number']]}
      />
      <p className="muted">Total (excluding GST / freight): <b>{inr(total)}</b></p>

      <h4>4. Remarks</h4>
      <div className="form-grid">
        {I('Special size / packing / customer requirement', f.remarks, (v) => set('remarks', v), {}, 2)}
      </div>
    </Modal>
  );
}

// ─────────────────────────────── Purchase Indent ───────────────────────────────

const PRIORITIES = ['Normal', 'Urgent'];

// Purchase paperwork is three pages, one step each (like the truck flow):
//   Purchase Indent (create + list) → Indent Approval → Purchase Order
export const IndentPage = () => (
  <IndentQueue
    title="Purchase Indent" create
    subtitle="The department raises its material request (indent) here. It then moves to Indent Approval, followed by Purchase Order."
  />
);
export const IndentApprovalPage = () => (
  <IndentQueue
    title="Indent Approval" step="indentapproval"
    subtitle="Approve or reject new indents."
    tabs={[
      { key: 'pending', label: 'Pending Approval', statuses: ['pending'], pending: true },
      { key: 'done', label: 'History', statuses: ['approved', 'po', 'rejected'] },
    ]}
  />
);
export const PoPage = () => (
  <IndentQueue
    title="Purchase Order" step="po"
    subtitle="Create a PO for an approved indent (supplier, rate, EX/FOR). Once the PO is created, it can be selected in an Unloading Advice."
    tabs={[
      { key: 'pending', label: 'PO Pending', statuses: ['approved'], pending: true },
      { key: 'done', label: 'PO Created', statuses: ['po'] },
    ]}
  />
);

function IndentQueue({ title, subtitle, create, step, tabs }) {
  const { state, can } = useStore();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null); // { id, act }
  const [tabKey, setTabKey] = useState(tabs?.[0].key);
  const all = state.orders.filter((o) => o.type === 'purchase');
  const tab = tabs?.find((t) => t.key === tabKey);
  const inTab = (t, o) => t.statuses.includes(o.status);
  const rows = tab ? all.filter((o) => inTab(tab, o)) : all;
  const canAct = step && tab?.pending && can('purchase', step, 'action');
  const sel = view && state.orders.find((o) => o.id === view.id);

  return (
    <>
      <PageHead
        title={`Purchase · ${title}`}
        sub={subtitle}
        right={create && can('purchase', 'indent', 'create') && <button className="btn primary" onClick={() => setCreating(true)}>+ Create Indent</button>}
      />
      {tabs && (
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.key} className={t.key === tabKey ? 'on' : ''} onClick={() => setTabKey(t.key)}>
              {t.label}<i>{all.filter((o) => inTab(t, o)).length}</i>
            </button>
          ))}
        </div>
      )}
      <div className="card">
        {rows.length === 0 ? <Empty text="No indents found." /> : (
          <table className="tbl">
            <thead><tr><th>Indent No.</th><th>Department</th><th>Indented By</th><th>Material</th><th>Qty</th><th>Required By</th><th>Priority</th><th>PO No.</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><b>{o.no}</b><div className="muted">{fmtDate(o.date)}</div></td>
                  <td>{o.dept}</td>
                  <td>{o.by}</td>
                  <td className="clip">{itemsText(o)}</td>
                  <td>{qtyOf(o)} MT</td>
                  <td>{fmtDate(o.requiredBy)}</td>
                  <td>{o.priority === 'Urgent' ? <span className="badge amber">Urgent</span> : 'Normal'}</td>
                  <td>{o.po?.no || <span className="muted">—</span>}</td>
                  <td><span className={`badge ${INDENT_STATUS[o.status].tone}`}>{INDENT_STATUS[o.status].label}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setView({ id: o.id, act: null })}>View</button>{' '}
                    {canAct && <button className="btn sm primary" onClick={() => setView({ id: o.id, act: step })}>Action</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && <IndentView o={sel} act={view.act} onClose={() => setView(null)} />}
      {creating && <IndentForm onClose={() => setCreating(false)} />}
    </>
  );
}

/** `act` = 'indentapproval' (approve / reject) | 'po' (create PO) | null (read-only). */
function IndentView({ o, act, onClose }) {
  const { state, updateOrder, user } = useStore();
  const approving = act === 'indentapproval' && o.status === 'pending';
  const makingPo = act === 'po' && o.status === 'approved';
  const [remark, setRemark] = useState('');
  const [po, setPo] = useState({ no: '', supplier: '', acName: '', rate: '', freightTerms: 'for' });
  const now = () => new Date().toISOString();
  const decide = (status) => { updateOrder(o.id, { status, approval: { by: user.name, time: now(), remark } }); onClose(); };
  const savePo = () => { updateOrder(o.id, { status: 'po', po: { ...po, rate: Number(po.rate) || 0, by: user.name, time: now() } }); onClose(); };
  const advices = state.advices.filter((a) => a.type === 'purchase' && o.po?.no && a.orderRef === o.po.no);

  return (
    <Modal title={`${o.no} – Purchase Indent`} wide onClose={onClose}
      footer={approving ? (
        <><button className="btn danger" onClick={() => decide('rejected')}>Reject</button><button className="btn primary" onClick={() => decide('approved')}>Approve</button></>
      ) : makingPo ? (
        <button className="btn primary" disabled={!po.no || !po.supplier} onClick={savePo}>Save PO</button>
      ) : null}>
      <div className="grid2">
        <Row k="Indent Date" v={fmtDate(o.date)} />
        <Row k="Status" v={INDENT_STATUS[o.status].label} />
        <Row k="Department" v={o.dept} />
        <Row k="Indented By" v={o.by} />
        <Row k="Required By" v={fmtDate(o.requiredBy)} />
        <Row k="Priority" v={o.priority} />
        <Row k="Suggested Supplier" v={o.suggestedSupplier} />
        <Row k="Purpose / Use" v={o.purpose} />
      </div>
      <h4>Items</h4>
      <table className="tbl mini">
        <thead><tr><th>Item</th><th>Size</th><th>Grade</th><th>Qty (MT)</th></tr></thead>
        <tbody>{o.items.map((i, x) => <tr key={x}><td>{i.desc}</td><td>{i.size}</td><td>{i.grade}</td><td>{i.qty}</td></tr>)}</tbody>
      </table>

      {o.approval && (
        <div className={`alert ${o.status === 'rejected' ? 'warn' : 'ok'}`}>
          {o.status === 'rejected' ? 'Rejected' : 'Approved'} by <b>{o.approval.by}</b> · {fmtDT(o.approval.time)}{o.approval.remark ? ` – “${o.approval.remark}”` : ''}
        </div>
      )}
      {o.po && (
        <>
          <h4>Purchase Order</h4>
          <div className="grid2">
            <Row k="PO No." v={o.po.no} />
            <Row k="Supplier" v={o.po.supplier} />
            <Row k="Rate (₹/MT)" v={o.po.rate ? Number(o.po.rate).toLocaleString('en-IN') : ''} />
            <Row k="Freight Terms" v={termsText('purchase', o.po.freightTerms)} />
            <Row k="PO By" v={`${o.po.by} · ${fmtDT(o.po.time)}`} />
            <Row k="Unloading Advices" v={advices.map((a) => a.no).join(', ') || 'None yet'} />
          </div>
        </>
      )}

      {approving && (
        <div className="form-grid">
          <Field label="Approval / rejection remark" span={2}><input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
        </div>
      )}
      {makingPo && (
        <>
          <h4>Create PO</h4>
          <div className="form-grid">
            <Field label="PO No. *"><input value={po.no} placeholder="PO/26/060" onChange={(e) => setPo({ ...po, no: e.target.value.toUpperCase() })} /></Field>
            <Field label="Supplier *"><input value={po.supplier} placeholder={o.suggestedSupplier} onChange={(e) => setPo({ ...po, supplier: e.target.value })} /></Field>
            <Field label="A/c Name"><input value={po.acName} onChange={(e) => setPo({ ...po, acName: e.target.value })} /></Field>
            <Field label="Rate (₹/MT)"><input type="number" value={po.rate} onChange={(e) => setPo({ ...po, rate: e.target.value })} /></Field>
            <Field label="Freight Terms (EX / FOR)">
              <select value={po.freightTerms} onChange={(e) => setPo({ ...po, freightTerms: e.target.value })}>
                <option value="ex">{termsText('purchase', 'ex')}</option>
                <option value="for">{termsText('purchase', 'for')}</option>
              </select>
            </Field>
          </div>
        </>
      )}
    </Modal>
  );
}

function IndentForm({ onClose }) {
  const { createOrder, user } = useStore();
  const [f, setF] = useState({
    date: today(), dept: '', requiredBy: '', priority: 'Normal', purpose: '', suggestedSupplier: '',
    items: [{ ...emptyLine }],
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.dept && f.requiredBy && f.items.every((i) => i.desc && Number(i.qty) > 0);
  const save = () => {
    createOrder('purchase', {
      ...f, by: user.name, status: 'pending',
      items: f.items.map(({ rate, ...i }) => ({ ...i, qty: Number(i.qty) || 0 })),
    });
    onClose();
  };
  const I = (label, value, onChange, props = {}, span = 1) => (
    <Field label={label} span={span}><input value={value} onChange={(e) => onChange(e.target.value)} {...props} /></Field>
  );

  return (
    <Modal title="Create Purchase Indent" wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Submit Indent</button></>}>
      <p className="muted">The indent number is generated automatically. After submitting, it goes for approval.</p>
      <h4>1. Indent Details</h4>
      <div className="form-grid">
        {I('Indent Date *', f.date, (v) => set('date', v), { type: 'date' })}
        <Field label="Indented By"><input value={user.name} disabled /></Field>
        {I('Department *', f.dept, (v) => set('dept', v), { placeholder: 'Production / Store / Maintenance…' })}
        {I('Required By *', f.requiredBy, (v) => set('requiredBy', v), { type: 'date' })}
        <Field label="Priority">
          <select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        {I('Suggested Supplier', f.suggestedSupplier, (v) => set('suggestedSupplier', v))}
        {I('Purpose / Reason for request', f.purpose, (v) => set('purpose', v), {}, 2)}
      </div>
      <h4>2. Material Required</h4>
      <ItemTable
        items={f.items}
        onChange={(v) => set('items', v)}
        cols={[['desc', 'Item Description *'], ['size', 'Size'], ['grade', 'Grade / Spec'], ['qty', 'Qty (MT) *', 'number']]}
      />
    </Modal>
  );
}
