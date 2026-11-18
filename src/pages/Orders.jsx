import React, { useState } from 'react';
import Ico from '../components/Icon.jsx';
import { useStore } from '../store.jsx';
import { INDENT_STATUS, lineIsItem, orderProgress, termsText } from '../data.js';
import { Empty, Field, Modal, PageHead, fmtDT } from '../components/ui.jsx';
import { ExportButtons, ImportButtons, ImportMsg } from '../components/DataIO.jsx';

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

// Party suggestions from Master: type 'Purchase' = Suppliers (PO / indent), 'Sales' = Customers (Sales Order).
export function VendorList({ id, type = 'Purchase' }) {
  const { state } = useStore();
  return (
    <datalist id={id}>
      {(state.vendors || []).filter((v) => v.type === type).map((v) => <option key={v.id} value={v.name} />)}
    </datalist>
  );
}

/**
 * Editable item rows shared by both forms. `cols` = [key, label, type][]
 * `use` ('sales' | 'purchase') = which Master → Products (Sales / Purchase tab) are offered in the "Product" picker; picking one fills
 * name / size / grade exactly (and the price when the row has a rate), so Inventory can count the line.
 */
function ItemTable({ items, cols, onChange, use }) {
  const { state } = useStore();
  const setItem = (i, k, v) => onChange(items.map((it, x) => (x === i ? { ...it, [k]: v } : it)));
  const products = (state.items || []).filter((x) => x.active && x.use === use);
  const hasRate = cols.some(([k]) => k === 'rate');
  const pick = (i, id) => {
    const m = products.find((x) => x.id === id);
    if (m) onChange(items.map((it, x) => (x === i ? { ...it, desc: m.name, size: m.size, grade: m.grade, ...(hasRate && !it.rate && m.rate ? { rate: m.rate } : {}) } : it)));
  };
  return (
    <>
      <table className="tbl mini">
        <thead><tr><th>Product</th>{cols.map(([k, label]) => <th key={k}>{label}</th>)}<th /></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>
                <select value={products.find((m) => lineIsItem(it, m))?.id || ''} onChange={(e) => pick(i, e.target.value)}>
                  <option value="">— Pick product —</option>
                  {products.map((m) => <option key={m.id} value={m.id}>{m.code} – {m.name} {m.size}</option>)}
                </select>
              </td>
              {cols.map(([k, , type]) => (
                <td key={k}><input type={type || 'text'} value={it[k]} onChange={(e) => setItem(i, k, e.target.value)} /></td>
              ))}
              <td>{items.length > 1 && <button className="icon-btn" onClick={() => onChange(items.filter((_, x) => x !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" onClick={() => onChange([...items, { ...emptyLine }])}><Ico name="add" />Add item</button>
    </>
  );
}

// ─────────────────────────────── CSV import helpers ───────────────────────────────
// Dates may be typed as 2026-11-18, 18-11-2026 or 18/11/2026. Returns 'YYYY-MM-DD', '' when blank, null when not a date.
export const toIsoDate = (v) => {
  const t = String(v || '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};
const numCell = (v) => { const t = String(v ?? '').replace(/,/g, '').trim(); return t === '' ? '' : Number(t); };

/**
 * Group CSV rows into orders by `refCol`. `head(r)` builds the order fields from its first row,
 * `line(r)` one item line; each returns { data, errors }. Returns { orders, errors } (an order with any error is skipped).
 */
function groupImport(rows, refCol, head, line) {
  const groups = new Map();
  rows.forEach((r, i) => {
    const ref = String(r[refCol] || '').trim() || `#${i + 2}`;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push({ r, rowNo: i + 2 });
  });
  const orders = [];
  const errors = [];
  groups.forEach((list, ref) => {
    const h = head(list[0].r);
    const errs = [...h.errors];
    const items = list.map(({ r, rowNo }) => {
      const l = line(r);
      l.errors.forEach((e) => errs.push(`row ${rowNo}: ${e}`));
      return l.data;
    });
    if (errs.length) errors.push(`${refCol} ${ref} – ${errs.join(', ')}`);
    else orders.push({ ...h.data, items });
  });
  return { orders, errors };
}
const importResult = (orders, errors, what) => ({
  tone: errors.length ? 'warn' : 'ok',
  text: `${orders} ${what}(s) imported.${errors.length ? ` ${errors.length} skipped – ${errors.slice(0, 4).join(' · ')}${errors.length > 4 ? ' …' : ''}` : ''}`,
});
const lineErrors = (r) => {
  const e = [];
  if (!String(r.Item || '').trim()) e.push('Item is required');
  const q = numCell(r['Qty (MT)']);
  if (!(q > 0)) e.push('Qty (MT) must be more than 0');
  return e;
};

const SO_FORMAT = {
  filename: 'sales-orders-format.csv',
  required: ['Order Ref', 'Customer', 'Item', 'Qty (MT)'],
  headers: ['Order Ref', 'Date', 'Customer', 'Customer Ref', 'Ship To', 'Billing GST', 'Billing Address', 'Freight Terms (EX/FOR)', 'Payment Terms', 'Delivery By', 'Item', 'Size', 'Grade', 'Qty (MT)', 'Rate'],
  sample: [
    ['1', '18-11-2026', 'Shree Steel Traders', 'PO-7781', 'Nagpur, MH', '27ABCDE1234F1Z5', 'Transport Nagar, Nagpur, MH', 'EX', '30 days credit', '25-11-2026', 'MS Square Tube', '40x40x2.0 mm', 'YST-210', '10', '61500'],
    ['1', '', '', '', '', '', '', '', '', '', 'MS Round Tube', '50 NB', 'YST-240', '5', '61500'],
  ],
};
const INDENT_FORMAT = {
  filename: 'purchase-indents-format.csv',
  required: ['Indent Ref', 'Department', 'Required By', 'Item', 'Qty (MT)'],
  headers: ['Indent Ref', 'Date', 'Department', 'Required By', 'Priority (Normal/Urgent)', 'Purpose', 'Suggested Supplier', 'Item', 'Size', 'Grade', 'Qty (MT)'],
  sample: [
    ['1', '18-11-2026', 'Production', '25-11-2026', 'Normal', 'Tube mill – next week plan', 'Godawari Ispat Ltd', 'HR Coil', '2.5 mm x 1250 mm', 'IS 10748', '50'],
    ['1', '', '', '', '', '', '', 'MS Packing Strap', '32 mm', '', '1'],
  ],
};

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
      <PageHead
        title="Sales · Order Approval"
        sub="Review the rate, party and payment terms of new Sales Orders, then Approve or Reject. A Loading Advice can be created only for approved orders."
        right={
          <ExportButtons
            title={`Order Approval – ${tab.label}`} filename={`order-approval-${tab.key}`} rows={rows}
            columns={[
              ['SO No.', (o) => o.no], ['Date', (o) => fmtDate(o.date)], ['Customer', (o) => o.party], ['Material', itemsText], ['Qty (MT)', qtyOf],
              ['Value (Rs.)', (o) => Math.round(o.items.reduce((s, i) => s + i.qty * i.rate, 0))], ['Payment Terms', (o) => o.paymentTerms],
              ['Created By', (o) => o.by], ['Status', (o) => soStatus(o, orderProgress(o, state.advices))[0]],
            ]}
          />
        }
      />
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
                  <td className="acts">
                    <button className="btn sm" onClick={() => setView({ id: o.id, act: false })}><Ico name="view" />View</button>{' '}
                    {canAct && <button className="btn sm primary" onClick={() => setView({ id: o.id, act: true })}><Ico name="action" />Action</button>}
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

// A Sales Order / Indent can be corrected until it is approved (or after a rejection, to resubmit).
const canEditOrder = (o) => o.status === 'pending' || o.status === 'rejected';

function SalesOrderPage() {
  const { state, can, user, createOrders } = useStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const editOrder = editing && state.orders.find((o) => o.id === editing);
  const [msg, setMsg] = useState(null);
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
        right={
          <>
            {can('sales', 'order', 'create') && (
              <>
                <ImportButtons format={SO_FORMAT} onImport={(rows) => {
                  const { orders, errors } = groupImport(rows, 'Order Ref', (r) => {
                    const e = [];
                    const date = toIsoDate(r.Date);
                    const delivery = toIsoDate(r['Delivery By']);
                    if (date === null) e.push('Date is not a valid date');
                    if (delivery === null) e.push('Delivery By is not a valid date');
                    if (!String(r.Customer || '').trim()) e.push('Customer is required');
                    const ft = String(r['Freight Terms (EX/FOR)'] || '').trim().toLowerCase();
                    if (ft && !['ex', 'for'].includes(ft)) e.push('Freight Terms must be EX or FOR');
                    const party = String(r.Customer || '').trim();
                    return {
                      errors: e,
                      data: {
                        date: date || today(), party, acName: '', custRef: String(r['Customer Ref'] || '').trim(), salesPerson: user.name,
                        billingInfo: { party, address: String(r['Billing Address'] || '').trim(), gst: String(r['Billing GST'] || '').trim().toUpperCase() },
                        shipTo: String(r['Ship To'] || '').trim(), freightTerms: ft || 'for', deliveryDate: delivery || '',
                        paymentTerms: String(r['Payment Terms'] || '').trim(), remarks: '', by: user.name, status: 'pending',
                      },
                    };
                  }, (r) => ({
                    errors: lineErrors(r),
                    data: { desc: String(r.Item || '').trim(), size: String(r.Size || '').trim(), grade: String(r.Grade || '').trim(), qty: Number(numCell(r['Qty (MT)'])) || 0, rate: Number(numCell(r.Rate)) || 0 },
                  }));
                  if (orders.length) createOrders('sales', orders);
                  setMsg(importResult(orders.length, errors, 'Sales Order'));
                }} />
              </>
            )}
            <ExportButtons
              title="Sales Orders" filename="sales-orders" rows={rows}
              columns={[
                ['SO No.', (o) => o.no], ['Date', (o) => fmtDate(o.date)], ['Customer', (o) => o.party], ['Material', itemsText],
                ['Order Qty (MT)', (o) => orderProgress(o, state.advices).ordered], ['Advice Qty (MT)', (o) => orderProgress(o, state.advices).planned],
                ['Dispatched (MT)', (o) => orderProgress(o, state.advices).dispatched], ['Delivery By', (o) => fmtDate(o.deliveryDate)],
                ['Payment Terms', (o) => o.paymentTerms], ['Status', (o) => soStatus(o, orderProgress(o, state.advices))[0]],
              ]}
            />
            {can('sales', 'order', 'create') && <button className="btn primary" onClick={() => setCreating(true)}><Ico name="add" />Create Sales Order</button>}
          </>
        }
      />
      <ImportMsg msg={msg} clear={() => setMsg(null)} />
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
                    <td className="acts">
                      <button className="btn sm" onClick={() => setView(o.id)}><Ico name="view" />View</button>
                      {canEditOrder(o) && can('sales', 'order', 'create') && <button className="btn sm" onClick={() => setEditing(o.id)}><Ico name="edit" />Edit</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {sel && <SalesOrderView o={sel} onClose={() => setView(null)} />}
      {creating && <SalesOrderForm onClose={() => setCreating(false)} />}
      {editOrder && <SalesOrderForm order={editOrder} onClose={() => setEditing(null)} />}
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
        <><button className="btn danger" onClick={() => decide('rejected')}><Ico name="reject" />Reject</button><button className="btn primary" onClick={() => decide('approved')}><Ico name="approve" />Approve</button></>
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

/** `order` given = edit that order (allowed while pending / rejected; saving sends it back for approval). */
function SalesOrderForm({ onClose, order }) {
  const { createOrder, updateOrder, user, state } = useStore();
  const [f, setF] = useState(() => order
    ? {
        date: order.date || today(), party: order.party || '', acName: order.acName || '', custRef: order.custRef || '', salesPerson: order.salesPerson || '',
        billingInfo: { party: '', address: '', gst: '', ...order.billingInfo }, shipTo: order.shipTo || '',
        items: order.items.map((i) => ({ ...emptyLine, ...i, qty: String(i.qty ?? ''), rate: String(i.rate ?? '') })),
        freightTerms: order.freightTerms || 'for', deliveryDate: order.deliveryDate || '', paymentTerms: order.paymentTerms || '', remarks: order.remarks || '',
      }
    : {
        date: today(), party: '', acName: '', custRef: '', salesPerson: user.name,
        billingInfo: { party: '', address: '', gst: '' }, shipTo: '',
        items: [{ ...emptyLine }], freightTerms: 'for', deliveryDate: '', paymentTerms: '', remarks: '',
      });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const nest = (k, v) => setF((s) => ({ ...s, billingInfo: { ...s.billingInfo, [k]: v } }));
  const valid = f.party && f.date && f.items.every((i) => i.desc && Number(i.qty) > 0);
  const total = f.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  const save = () => {
    const data = {
      ...f,
      billingInfo: { ...f.billingInfo, party: f.billingInfo.party || f.party },
      items: f.items.map((i) => ({ ...i, qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 })),
    };
    if (order) updateOrder(order.id, { ...data, status: 'pending', approval: undefined, editedBy: user.name, editedAt: new Date().toISOString() });
    else createOrder('sales', { ...data, by: user.name, status: 'pending' }); // goes to Order Approval first
    onClose();
  };
  const I = (label, value, onChange, props = {}, span = 1) => (
    <Field label={label} span={span}><input value={value} onChange={(e) => onChange(e.target.value)} {...props} /></Field>
  );

  return (
    <Modal title={order ? `Edit Sales Order – ${order.no}` : 'Create Sales Order'} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>{order ? 'Save Changes' : 'Save Sales Order'}</button></>}>
      <p className="muted">{order ? 'After saving, the order goes to Order Approval again.' : 'The SO number is generated automatically on save. After saving, the order goes to Order Approval.'}</p>
      <h4>1. Customer Details</h4>
      <div className="form-grid">
        {I('Order Date *', f.date, (v) => set('date', v), { type: 'date' })}
        {I('Customer / Party Name *', f.party, (v) => set('party', v), { list: 'so-customers' })}
        <VendorList id="so-customers" type="Sales" />
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
        <Field label="Payment Terms" span={2} hint="Terms come from Master → Payment Terms">
          <select value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)}>
            <option value="">— Select —</option>
            {(state.paymentTerms || []).map((p) => <option key={p.id} value={p.value}>{p.value}</option>)}
            {f.paymentTerms && !(state.paymentTerms || []).some((p) => p.value === f.paymentTerms) && <option value={f.paymentTerms}>{f.paymentTerms}</option>}
          </select>
        </Field>
      </div>

      <h4>3. Items</h4>
      <ItemTable
        use="sales"
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
  const { state, can, user, createOrders } = useStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const editOrder = editing && state.orders.find((o) => o.id === editing);
  const [msg, setMsg] = useState(null);
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
        right={
          <>
            {create && can('purchase', 'indent', 'create') && (
              <>
                <ImportButtons format={INDENT_FORMAT} onImport={(rows) => {
                  const { orders, errors } = groupImport(rows, 'Indent Ref', (r) => {
                    const e = [];
                    const date = toIsoDate(r.Date);
                    const req = toIsoDate(r['Required By']);
                    if (date === null) e.push('Date is not a valid date');
                    if (!req) e.push('Required By must be a date');
                    if (!String(r.Department || '').trim()) e.push('Department is required');
                    const pr = String(r['Priority (Normal/Urgent)'] || '').trim().toLowerCase();
                    return {
                      errors: e,
                      data: {
                        date: date || today(), dept: String(r.Department || '').trim(), requiredBy: req || '', priority: pr === 'urgent' ? 'Urgent' : 'Normal',
                        purpose: String(r.Purpose || '').trim(), suggestedSupplier: String(r['Suggested Supplier'] || '').trim(), by: user.name, status: 'pending',
                      },
                    };
                  }, (r) => ({
                    errors: lineErrors(r),
                    data: { desc: String(r.Item || '').trim(), size: String(r.Size || '').trim(), grade: String(r.Grade || '').trim(), qty: Number(numCell(r['Qty (MT)'])) || 0 },
                  }));
                  if (orders.length) createOrders('purchase', orders);
                  setMsg(importResult(orders.length, errors, 'Indent'));
                }} />
              </>
            )}
            <ExportButtons
              title={`${title}${tab ? ` – ${tab.label}` : ''}`} filename={`purchase-${step || 'indent'}${tab ? `-${tab.key}` : ''}`} rows={rows}
              columns={[
                ['Indent No.', (o) => o.no], ['Date', (o) => fmtDate(o.date)], ['Department', (o) => o.dept], ['Indented By', (o) => o.by],
                ['Material', itemsText], ['Qty (MT)', qtyOf], ['Required By', (o) => fmtDate(o.requiredBy)], ['Priority', (o) => o.priority],
                ['PO No.', (o) => o.po?.no], ['Supplier', (o) => o.po?.supplier || o.suggestedSupplier], ['Status', (o) => INDENT_STATUS[o.status].label],
              ]}
            />
            {create && can('purchase', 'indent', 'create') && <button className="btn primary" onClick={() => setCreating(true)}><Ico name="add" />Create Indent</button>}
          </>
        }
      />
      <ImportMsg msg={msg} clear={() => setMsg(null)} />
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
                  <td className="acts">
                    <button className="btn sm" onClick={() => setView({ id: o.id, act: null })}><Ico name="view" />View</button>{' '}
                    {canAct && <button className="btn sm primary" onClick={() => setView({ id: o.id, act: step })}><Ico name="action" />Action</button>}
                    {create && canEditOrder(o) && can('purchase', 'indent', 'create') && <button className="btn sm" onClick={() => setEditing(o.id)}><Ico name="edit" />Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && <IndentView o={sel} act={view.act} onClose={() => setView(null)} />}
      {creating && <IndentForm onClose={() => setCreating(false)} />}
      {editOrder && <IndentForm order={editOrder} onClose={() => setEditing(null)} />}
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
        <><button className="btn danger" onClick={() => decide('rejected')}><Ico name="reject" />Reject</button><button className="btn primary" onClick={() => decide('approved')}><Ico name="approve" />Approve</button></>
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
            <Field label="Supplier *" hint="Pick from Master → Vendors (Suppliers) or type a name">
              <input list="po-vendors" value={po.supplier} placeholder={o.suggestedSupplier} onChange={(e) => setPo({ ...po, supplier: e.target.value })} />
              <VendorList id="po-vendors" />
            </Field>
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

/** `order` given = edit that indent (allowed while pending / rejected; saving sends it back for approval). */
function IndentForm({ onClose, order }) {
  const { createOrder, updateOrder, user } = useStore();
  const [f, setF] = useState(() => order
    ? {
        date: order.date || today(), dept: order.dept || '', requiredBy: order.requiredBy || '', priority: order.priority || 'Normal',
        purpose: order.purpose || '', suggestedSupplier: order.suggestedSupplier || '',
        items: order.items.map((i) => ({ ...emptyLine, ...i, qty: String(i.qty ?? '') })),
      }
    : {
        date: today(), dept: '', requiredBy: '', priority: 'Normal', purpose: '', suggestedSupplier: '',
        items: [{ ...emptyLine }],
      });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.dept && f.requiredBy && f.items.every((i) => i.desc && Number(i.qty) > 0);
  const save = () => {
    const items = f.items.map(({ rate, ...i }) => ({ ...i, qty: Number(i.qty) || 0 }));
    if (order) updateOrder(order.id, { ...f, items, status: 'pending', approval: undefined, editedBy: user.name, editedAt: new Date().toISOString() });
    else createOrder('purchase', { ...f, by: user.name, status: 'pending', items });
    onClose();
  };
  const I = (label, value, onChange, props = {}, span = 1) => (
    <Field label={label} span={span}><input value={value} onChange={(e) => onChange(e.target.value)} {...props} /></Field>
  );

  return (
    <Modal title={order ? `Edit Purchase Indent – ${order.no}` : 'Create Purchase Indent'} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>{order ? 'Save Changes' : 'Submit Indent'}</button></>}>
      <p className="muted">{order ? 'After saving, the indent goes for approval again.' : 'The indent number is generated automatically. After submitting, it goes for approval.'}</p>
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
        {I('Suggested Supplier', f.suggestedSupplier, (v) => set('suggestedSupplier', v), { list: 'indent-vendors' })}
        <VendorList id="indent-vendors" />
        {I('Purpose / Reason for request', f.purpose, (v) => set('purpose', v), {}, 2)}
      </div>
      <h4>2. Material Required</h4>
      <ItemTable
        use="purchase"
        items={f.items}
        onChange={(v) => set('items', v)}
        cols={[['desc', 'Item Description *'], ['size', 'Size'], ['grade', 'Grade / Spec'], ['qty', 'Qty (MT) *', 'number']]}
      />
    </Modal>
  );
}
