// Constants, labels and seed data (UI-only – everything lives in localStorage)

export const SUBSYSTEMS = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchase', label: 'Purchase' },
];

// One subsystem per step.
// Sales (loaded truck goes out):  Advice → Verification → Weighment → Loading → Final Weighment
//   → Billing → Document Verification (Gate Pass generated here) → Security Clearance → Gate-Out
// Purchase (truck unloads, leaves EMPTY – supplier already billed, nothing of ours travels with it):
//   Advice → Verification → Weighment → Unloading → Final Weighment → Material Receipt (GRN) → Gate-Out
// `only` limits a module to one subsystem.
export const MODULES = [
  // Paperwork that comes BEFORE a truck: Sales Order (customer) / Purchase Indent (department → approval → PO).
  { key: 'order', label: 'Sales Order', actions: ['view', 'create'], only: 'sales' },
  { key: 'orderapproval', label: 'Order Approval', actions: ['view', 'action'], only: 'sales' },
  { key: 'indent', label: 'Purchase Indent', actions: ['view', 'create'], only: 'purchase' },
  { key: 'indentapproval', label: 'Indent Approval', actions: ['view', 'action'], only: 'purchase' },
  { key: 'po', label: 'Purchase Order', actions: ['view', 'action'], only: 'purchase' },
  { key: 'inventory', label: 'Advice', actions: ['view', 'create', 'action'] },
  { key: 'gatein', label: 'Verification', actions: ['view', 'action'] },
  { key: 'weighin', label: 'Weighment', actions: ['view', 'action'] },
  { key: 'loading', label: 'Loading / Unloading', actions: ['view', 'action'] },
  { key: 'weighout', label: 'Final Weighment', actions: ['view', 'action'] },
  { key: 'billing', label: 'Billing', actions: ['view', 'action'], only: 'sales' },
  { key: 'docverify', label: 'Document Verification', actions: ['view', 'action'], only: 'sales' },
  { key: 'clearance', label: 'Security Clearance', actions: ['view', 'action'], only: 'sales' },
  { key: 'grn', label: 'Material Receipt (GRN)', actions: ['view', 'action'], only: 'purchase' },
  { key: 'gateout', label: 'Gate-Out', actions: ['view', 'action'] },
  // Purchase has no bilty page: the driver's LR no. + photo are recorded at Gate-In.
  { key: 'bilty', label: 'Bilty / LR', actions: ['view'], only: 'sales' },
];
export const modulesFor = (sub) => MODULES.filter((m) => !m.only || m.only === sub);

export const ACTION_LABEL = { view: 'View', create: 'Create', action: 'Action / Approve' };

export const labelsFor = (sub) =>
  sub === 'purchase'
    ? { act: 'Unloading', advice: 'Unloading Advice', party: 'Supplier', prefix: 'PUR', from: 'Supplier Location', to: 'Plant / Destination' }
    : { act: 'Loading', advice: 'Loading Advice', party: 'Customer', prefix: 'SLS', from: 'From (Plant)', to: 'Destination' };

// A truck's actual purpose (Loading / Unloading) is chosen per-advice via a dropdown at
// creation, independent of the Sales/Purchase subsystem it was created under (e.g. a
// sales return can be an "Unloading" even though it lives in the Sales subsystem).
// Falls back to the subsystem's default act for older records that have no `purpose`.
export const actOf = (a) => (a.purpose === 'unloading' ? 'Unloading' : a.purpose === 'loading' ? 'Loading' : labelsFor(a.type).act);

// Freight terms. Sales: EX = the party collects with its own vehicle (freight paid by the party),
// FOR = we deliver to the destination (freight paid by us, added to the invoice).
// Purchase flips: EX = we collect from the supplier (freight paid by us),
// FOR = the supplier delivers to the plant (freight paid by the supplier).
// Older records without the field: if we carry a freight amount we bear it
// (Sales → FOR, Purchase → EX), otherwise the other party does.
export const termsOf = (a) => {
  if (a.freightTerms) return a.freightTerms;
  const weBear = Number(a.freight) > 0;
  return a.type === 'purchase' ? (weBear ? 'ex' : 'for') : (weBear ? 'for' : 'ex');
};
export const termsText = (sub, terms) =>
  ({
    sales: { ex: 'Ex-Works (EX) – freight paid by the party', for: 'FOR – freight paid by us (added to invoice)' },
    purchase: { ex: 'Ex-Works (EX) – freight paid by us', for: 'FOR – freight paid by the supplier' },
  }[sub][terms]);
// Do we carry the freight cost on our side (shown in billing / bilty)?
export const weBearFreight = (a) => (a.type === 'purchase' ? termsOf(a) === 'ex' : termsOf(a) === 'for');

// Does user `u` hold `action` ('view' | 'create' | 'action') on page `key` ("sales.gatein")?
// Either through their own permission, or because a colleague who has it listed `u` among their
// Alternative Users for that page (so `u` can cover when the colleague is away).
// `alt[key]` is a list of user ids (a single id string from older saves is accepted too).
export const altsOf = (u, key) => [].concat(u?.alt?.[key] || []);
export const userCan = (users, u, key, action = 'view') =>
  !!u?.perms?.[key]?.includes(action) ||
  users.some((o) => o.id !== u?.id && altsOf(o, key).includes(u?.id) && o.perms?.[key]?.includes(action));

// Display name AND url slug for each module – both follow the subsystem's own wording
// (Sales = Loading, Purchase = Unloading), not a generic combined label.
export const nameOf = (sub, key) => {
  const L = labelsFor(sub);
  return {
    order: 'Sales Order',
    orderapproval: 'Order Approval',
    indent: 'Purchase Indent',
    indentapproval: 'Indent Approval',
    po: 'Purchase Order',
    inventory: L.advice,
    gatein: 'Gate In (Verification)',
    weighin: 'Weighment',
    loading: L.act,
    weighout: 'Final Weighment',
    billing: 'Billing',
    docverify: 'Document Verification',
    clearance: 'Security Clearance',
    grn: 'Material Receipt (GRN)',
    gateout: 'Gate-Out',
    bilty: 'Bilty / LR',
  }[key];
};
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const slugOf = (sub, key) => slugify(nameOf(sub, key));
export const moduleOfSlug = (sub, slug) => modulesFor(sub).map((m) => m.key).find((k) => slugOf(sub, k) === slug);

// SOP: Advice → Verification → Weighment → Loading → Final Weighment → Billing
//      → Document Verification (+ Gate Pass) → Security Clearance → Gate-Out
// Each stage names the step that is PENDING on that truck right now.
// Each stage names the chain link that is PENDING on that truck. Tone = responsible department.
export const STAGES = {
  CREATED: { label: 'Gate In (Verification)', tone: 'gray' },
  GATED_IN: { label: 'Weighment', tone: 'blue' },
  TARE_DONE: { label: 'Loading / Unloading', tone: 'amber' },
  LOADED: { label: 'Final Weighment', tone: 'blue' },
  FINAL_DONE: { label: 'Billing', tone: 'purple' },
  BILLED: { label: 'Document Verification', tone: 'indigo' },
  DOC_OK: { label: 'Gate Pass', tone: 'indigo' }, // legacy only – verification now issues the gate pass (→ GATEPASS)
  GATEPASS: { label: 'Security Clearance', tone: 'teal' },
  CLEARED: { label: 'Gate-Out', tone: 'teal' },
  OUT: { label: 'Vehicle Released', tone: 'green' },
};

// The process-control chain per subsystem, shown on the dashboard.
export const SOP_FLOW = ['Advice', 'Verification', 'Weighment', 'Loading', 'Final Weighment', 'Billing', 'Document Verification', 'Security Clearance', 'Gate-Out'];
export const PURCHASE_FLOW = ['Advice', 'Verification', 'Weighment', 'Unloading', 'Final Weighment', 'Material Receipt (GRN)', 'Gate-Out'];
export const STAGE_ORDER = Object.keys(STAGES);

// Purchase never passes through our billing / dispatch-document / gate-pass stages:
// after Final Weighment (FINAL_DONE = GRN pending) the GRN moves it straight to CLEARED (Gate-Out pending).
const PURCHASE_SKIP = ['BILLED', 'DOC_OK', 'GATEPASS'];
export const stagesFor = (sub) => (sub === 'purchase' ? STAGE_ORDER.filter((s) => !PURCHASE_SKIP.includes(s)) : STAGE_ORDER);
export const stageLabel = (stage, sub) => (sub === 'purchase' && stage === 'FINAL_DONE' ? 'Material Receipt (GRN)' : STAGES[stage].label);

/**
 * Bring a purchase advice in line with the purchase flow: older records (and seed data
 * written before GRN existed) may sit in sales-only stages or carry billing / gate-pass
 * data. Those move to Gate-Out pending with a GRN record built from the weighment.
 */
export function normalizeAdvice(a) {
  if (a.type !== 'purchase') return a; // sales DOC_OK leftovers are handled by issueLegacyGatePasses
  const { billing, docVerify, dispatch, clearance, ...rest } = a;
  const stage = PURCHASE_SKIP.includes(a.stage) ? 'CLEARED' : a.stage;
  let grn = a.grn;
  if (!grn && ['CLEARED', 'OUT'].includes(stage)) {
    const net = typeof a.final?.weight === 'number' && typeof a.tare?.weight === 'number' ? Math.abs(a.tare.weight - a.final.weight) / 1000 : null;
    const time = billing?.time || a.final?.time;
    grn = {
      grnNo: `GRN-${new Date(time || Date.now()).getFullYear()}-${String(a.no).slice(-4)}`,
      netQty: net, invoiceQty: billing?.qty ?? net, quality: 'Accepted', remark: '', time, by: 'Rakesh (Store)',
    };
  }
  return { ...rest, stage, ...(grn ? { grn } : {}) };
}
// All stages strictly after `stage` – used to keep a completed step's History tab
// visible no matter how far the truck has since moved along the chain.
// Next Gate Pass / Bilty numbers – one running series over every truck that already has one.
export const nextDispatchNos = (advices) => {
  const y = new Date().getFullYear();
  const seq = String(advices.filter((x) => x.dispatch).length + 1).padStart(4, '0');
  return { gatePassNo: `GP-${y}-${seq}`, biltyNo: `LR-${y}-${seq}` };
};
// Sales trucks saved at DOC_OK (when Gate Pass was its own step) get their gate pass now,
// issued by whoever verified the documents, and move on to Security Clearance.
export const issueLegacyGatePasses = (advices) =>
  advices.reduce((out, a, i) => {
    if (a.type !== 'sales' || a.stage !== 'DOC_OK') return [...out, a];
    const nos = nextDispatchNos([...out, ...advices.slice(i + 1)]);
    const time = a.docVerify?.time || new Date().toISOString();
    return [...out, { ...a, stage: 'GATEPASS', dispatch: { remark: '', time, by: a.docVerify?.by || '', ...nos } }];
  }, []);

// ═══ TAT (turn-around time) – set in Master → TAT Settings ═══
// After the final weighment the truck must leave the plant within `exitMin` minutes.
// If it is late, it must be weighed again before Gate-Out; every re-weighment restarts the clock.
export const DEFAULT_TAT = { sales: { exitMin: 60 }, purchase: { exitMin: 60 } };
export const tatOf = (settings, sub) => ({ ...DEFAULT_TAT[sub], ...(settings?.tat?.[sub] || {}) });
// Time of the latest weighment (re-weighment if any, else the final weighment).
export const lastWeighTime = (a) => a.reweighs?.at(-1)?.time || a.final?.time;
/** Exit-TAT status of a truck that is inside the plant after its final weighment (null otherwise). */
export const exitTat = (a, settings, now = Date.now()) => {
  const from = lastWeighTime(a);
  if (!from || a.stage === 'OUT') return null;
  const limitMin = Number(tatOf(settings, a.type).exitMin) || 0;
  if (!limitMin) return null; // TAT switched off
  const elapsedMin = Math.floor((now - new Date(from)) / 60000);
  return { from, limitMin, elapsedMin, late: elapsedMin > limitMin, overMin: Math.max(0, elapsedMin - limitMin), leftMin: Math.max(0, limitMin - elapsedMin) };
};
export const minText = (m) => `${Math.floor(m / 60) ? Math.floor(m / 60) + ' hr ' : ''}${m % 60} min`;

export const afterStage = (stage) => STAGE_ORDER.slice(STAGE_ORDER.indexOf(stage) + 1);

// Which page/module acts on a truck at each stage (purchase: GRN after final weighment).
export const STAGE_MODULE = {
  CREATED: 'gatein', GATED_IN: 'weighin', TARE_DONE: 'loading', LOADED: 'weighout', FINAL_DONE: 'billing',
  BILLED: 'docverify', DOC_OK: 'docverify', GATEPASS: 'clearance', CLEARED: 'gateout',
};
export const moduleAt = (stage, sub) => (sub === 'purchase' && stage === 'FINAL_DONE' ? 'grn' : STAGE_MODULE[stage]);
// How many trucks of this subsystem are waiting on a module right now (sidebar badge).
export const pendingCount = (advices, sub, key) => advices.filter((a) => a.type === sub && moduleAt(a.stage, sub) === key).length;

export const ROLES = {
  admin: 'Admin',
  sales: 'Dispatch – Advice',
  gate: 'Security / Gate Incharge',
  kata: 'Weighbridge Incharge',
  loader: 'Loading / Unloading Supervisor',
  accounts: 'Accounts / Billing',
  dispatch: 'Dispatch Incharge',
  store: 'Store / GRN Incharge',
};

const full = ['view', 'create', 'action'];
const mk = (obj) => obj;

const allPerms = () => {
  const p = {};
  SUBSYSTEMS.forEach((s) => modulesFor(s.key).forEach((m) => (p[`${s.key}.${m.key}`] = m.actions.slice())));
  return p;
};

export const SEED_USERS = [
  { id: 'u1', name: 'Admin', role: 'admin', perms: allPerms() },
  {
    id: 'u2', name: 'Ramesh (Sales)', role: 'sales',
    perms: mk({ 'sales.order': ['view', 'create'], 'sales.inventory': full, 'sales.bilty': ['view'], 'purchase.indent': ['view'], 'purchase.inventory': full }),
  },
  {
    id: 'u3', name: 'Suresh (Gate)', role: 'gate',
    perms: mk({
      'sales.gatein': ['view', 'action'], 'sales.clearance': ['view', 'action'], 'sales.gateout': ['view', 'action'],
      'purchase.gatein': ['view', 'action'], 'purchase.gateout': ['view', 'action'],
    }),
  },
  {
    id: 'u4', name: 'Mahesh (Weighbridge)', role: 'kata',
    perms: mk({
      'sales.weighin': ['view', 'action'], 'sales.weighout': ['view', 'action'],
      'purchase.weighin': ['view', 'action'], 'purchase.weighout': ['view', 'action'],
    }),
  },
  {
    id: 'u5', name: 'Dinesh (Loading)', role: 'loader',
    perms: mk({ 'sales.loading': ['view', 'action'], 'purchase.loading': ['view', 'action'] }),
  },
  {
    id: 'u6', name: 'Anil (Dispatch)', role: 'dispatch',
    perms: mk({
      'sales.inventory': ['view'], 'sales.bilty': ['view'], 'sales.billing': ['view'], 'sales.docverify': ['view', 'action'],
    }),
  },
  {
    id: 'u7', name: 'Vinod (Accounts)', role: 'accounts',
    perms: mk({
      'sales.order': ['view'], 'sales.billing': ['view', 'action'], 'sales.inventory': ['view'], 'sales.bilty': ['view'],
      'purchase.grn': ['view'], 'purchase.inventory': ['view'],
    }),
  },
  {
    id: 'u8', name: 'Rakesh (Store)', role: 'store',
    perms: mk({ 'purchase.indent': ['view', 'create'], 'purchase.inventory': ['view'], 'purchase.weighout': ['view'], 'purchase.grn': ['view', 'action'] }),
  },
];

const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();

const base = (over) => ({
  date: iso(300),
  billingInfo: { party: '', address: '', gst: '', instr: '' },
  transport: { name: '', vehicle: '', driver: '', mobile: '', from: 'Urla, Raipur', to: '' },
  items: [],
  remarks: { special: '', customer: '', packing: '', handling: '' },
  freight: 0,
  ...over,
});

const RAW_ADVICES = [
  // 1. Advice just created – nothing done yet.
  base({
    id: 'a1', type: 'sales', no: 'SLS-0001', stage: 'CREATED', date: iso(40),
    party: 'Shree Steel Traders', acName: 'Shree Steel Traders – Raipur', orderRef: 'SO/26/118', rate: 61500, reqQty: 18,
    billingInfo: { party: 'Shree Steel Traders', address: 'Transport Nagar, Nagpur, MH', gst: '27ABCDE1234F1Z5', instr: 'Bill + ship to same' },
    transport: { name: 'Mahakal Roadlines', vehicle: 'CG04 AB 1234', driver: 'Ramlal', mobile: '9876500011', from: 'Urla, Raipur', to: 'Nagpur, MH' },
    items: [
      { desc: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', reqQty: 10, planQty: 10 },
      { desc: 'MS Round Tube', size: '50 NB', grade: 'YST-240', reqQty: 8, planQty: 8 },
    ],
    remarks: { special: '40x40 – cut length 6m', customer: 'Mill test certificate required', packing: 'Bundle of 50 pcs', handling: 'Use crane, no chain on tubes' },
    freight: 32000,
  }),
  // 2. Gate-In done, waiting at weighbridge for 1st weight.
  base({
    id: 'a2', type: 'sales', no: 'SLS-0002', stage: 'GATED_IN', date: iso(150),
    party: 'Balaji Infra Pvt Ltd', acName: 'Balaji Infra – Bilaspur', orderRef: 'SO/26/121', rate: 62000, reqQty: 12,
    billingInfo: { party: 'Balaji Infra Pvt Ltd', address: 'Link Road, Bilaspur, CG', gst: '22AAACB5678K1Z2', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 4455', driver: 'Kishan', mobile: '9876500022', from: 'Urla, Raipur', to: 'Bilaspur, CG' },
    items: [{ desc: 'MS Rectangular Tube', size: '60x40x2.5 mm', grade: 'YST-210', reqQty: 12, planQty: 12 }],
    remarks: { special: '', customer: '', packing: 'Bundle of 30 pcs', handling: '' },
    freight: 14000,
    gateIn: { time: iso(120), by: 'Suresh (Gate)' },
  }),
  // 3. 1st weight done, truck gone to loading yard.
  base({
    id: 'a3', type: 'sales', no: 'SLS-0003', stage: 'TARE_DONE', date: iso(200),
    party: 'Om Hardware', acName: 'Om Hardware – Durg', orderRef: 'SO/26/109', rate: 60800, reqQty: 9,
    billingInfo: { party: 'Om Hardware', address: 'Station Road, Durg, CG', gst: '22AAHFO9988M1Z9', instr: '' },
    transport: { name: 'Singh Transport', vehicle: 'CG04 MM 7788', driver: 'Harpal', mobile: '9876500033', from: 'Urla, Raipur', to: 'Durg, CG' },
    items: [{ desc: 'MS Round Tube', size: '25 NB', grade: 'YST-240', reqQty: 9, planQty: 9 }],
    freight: 6500,
    gateIn: { time: iso(180), by: 'Suresh (Gate)' },
    tare: { weight: 13800, photo: '', remark: 'Empty truck', method: 'manual', time: iso(170), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(150), by: 'Dinesh (Loading)' }, // started, not ended yet – shows "Started" status
  }),
  // 4. Loaded, final weight done – waiting for billing.
  base({
    id: 'a4', type: 'sales', no: 'SLS-0004', stage: 'FINAL_DONE', date: iso(420),
    party: 'Krishna Steel Corp', acName: 'Krishna Steel – Bhilai', orderRef: 'SO/26/102', rate: 59500, reqQty: 15,
    billingInfo: { party: 'Krishna Steel Corp', address: 'Steel Market, Bhilai, CG', gst: '22AAFCK4455L1Z7', instr: '' },
    transport: { name: 'Mahakal Roadlines', vehicle: 'CG04 AB 2211', driver: 'Sanjay', mobile: '9876500055', from: 'Urla, Raipur', to: 'Bhilai, CG' },
    items: [{ desc: 'MS Round Tube', size: '32 NB', grade: 'YST-240', reqQty: 15, planQty: 15 }],
    freight: 9500,
    gateIn: { time: iso(380), by: 'Suresh (Gate)' },
    tare: { weight: 13800, photo: '', remark: '', method: 'manual', time: iso(370), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(350), end: iso(270), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 28750, photo: '', remark: 'OK', method: 'manual', time: iso(250), by: 'Mahesh (Weighbridge)' },
  }),
  // 4b. Loading done, truck gone back to weighbridge for final weight.
  base({
    id: 'a4b', type: 'sales', no: 'SLS-0004B', stage: 'LOADED', date: iso(310),
    party: 'Balaji Infra Pvt Ltd', acName: 'Balaji Infra – Bilaspur', orderRef: 'SO/26/111', rate: 62000, reqQty: 10,
    billingInfo: { party: 'Balaji Infra Pvt Ltd', address: 'Link Road, Bilaspur, CG', gst: '22AAACB5678K1Z2', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 1122', driver: 'Prakash', mobile: '9876500200', from: 'Urla, Raipur', to: 'Bilaspur, CG' },
    items: [{ desc: 'MS Rectangular Tube', size: '60x40x2.5 mm', grade: 'YST-210', reqQty: 10, planQty: 10 }],
    freight: 12500,
    gateIn: { time: iso(290), by: 'Suresh (Gate)' },
    tare: { weight: 14000, photo: '', remark: '', method: 'manual', time: iso(280), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(270), end: iso(200), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
  }),
  // 5. Billed – waiting for dispatch's document verification.
  base({
    id: 'a5', type: 'sales', no: 'SLS-0005', stage: 'BILLED', date: iso(600),
    party: 'Shree Steel Traders', acName: 'Shree Steel Traders – Raipur', orderRef: 'SO/26/090', rate: 61000, reqQty: 10,
    billingInfo: { party: 'Shree Steel Traders', address: 'Transport Nagar, Nagpur, MH', gst: '27ABCDE1234F1Z5', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 6677', driver: 'Deepak', mobile: '9876500066', from: 'Urla, Raipur', to: 'Nagpur, MH' },
    items: [{ desc: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', reqQty: 10, planQty: 10 }],
    freight: 28000,
    gateIn: { time: iso(560), by: 'Suresh (Gate)' },
    tare: { weight: 14100, photo: '', remark: '', method: 'manual', time: iso(550), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(540), end: iso(460), delayMin: 15, delayReason: 'Stopped for crane maintenance', by: 'Dinesh (Loading)' },
    final: { weight: 24350, photo: '', remark: '', method: 'manual', time: iso(440), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 10.25, rate: 61000, basic: 625250, gauge: 0, extra: 0, freight: 28000, other: 0,
      taxable: 653250, gstPct: 18, gstAmt: 117585, total: 770835,
      invoiceNo: 'INV/26/0205', ewayBill: 'EWB7712884001', remark: '', time: iso(400), by: 'Vinod (Accounts)',
    },
  }),
  // 6. Documents verified (gate pass issued on verification) – waiting for security clearance.
  base({
    id: 'a6', type: 'sales', no: 'SLS-0006', stage: 'GATEPASS', date: iso(780),
    party: 'Balaji Infra Pvt Ltd', acName: 'Balaji Infra – Bilaspur', orderRef: 'SO/26/085', rate: 62000, reqQty: 11,
    billingInfo: { party: 'Balaji Infra Pvt Ltd', address: 'Link Road, Bilaspur, CG', gst: '22AAACB5678K1Z2', instr: '' },
    transport: { name: 'Singh Transport', vehicle: 'CG04 MM 3344', driver: 'Rajesh', mobile: '9876500077', from: 'Urla, Raipur', to: 'Bilaspur, CG' },
    items: [{ desc: 'MS Rectangular Tube', size: '60x40x2.5 mm', grade: 'YST-210', reqQty: 11, planQty: 11 }],
    freight: 13000,
    gateIn: { time: iso(740), by: 'Suresh (Gate)' },
    tare: { weight: 14050, photo: '', remark: '', method: 'manual', time: iso(730), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(720), end: iso(650), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 25100, photo: '', remark: '', method: 'manual', time: iso(630), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 11.05, rate: 62000, basic: 685100, gauge: 0, extra: 0, freight: 13000, other: 0,
      taxable: 698100, gstPct: 18, gstAmt: 125658, total: 823758,
      invoiceNo: 'INV/26/0198', ewayBill: 'EWB7712873002', remark: '', time: iso(600), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(560), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(560), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0013', biltyNo: 'LR-2026-0007' },
  }),
  // 7. Gate pass issued – waiting at main gate for security clearance.
  base({
    id: 'a7', type: 'sales', no: 'SLS-0007', stage: 'GATEPASS', date: iso(900),
    party: 'Om Hardware', acName: 'Om Hardware – Durg', orderRef: 'SO/26/070', rate: 60800, reqQty: 8,
    billingInfo: { party: 'Om Hardware', address: 'Station Road, Durg, CG', gst: '22AAHFO9988M1Z9', instr: '' },
    transport: { name: 'Mahakal Roadlines', vehicle: 'CG04 AB 5566', driver: 'Mukesh', mobile: '9876500088', from: 'Urla, Raipur', to: 'Durg, CG' },
    items: [{ desc: 'MS Round Tube', size: '25 NB', grade: 'YST-240', reqQty: 8, planQty: 8 }],
    freight: 6000,
    gateIn: { time: iso(860), by: 'Suresh (Gate)' },
    tare: { weight: 13600, photo: '', remark: '', method: 'manual', time: iso(850), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(840), end: iso(770), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 21700, photo: '', remark: '', method: 'manual', time: iso(750), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 8.1, rate: 60800, basic: 492480, gauge: 0, extra: 0, freight: 6000, other: 0,
      taxable: 498480, gstPct: 18, gstAmt: 89726, total: 588206,
      invoiceNo: 'INV/26/0180', ewayBill: 'EWB7712860003', remark: '', time: iso(700), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(660), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(620), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0001', biltyNo: 'LR-2026-0001' },
  }),
  // 8. Security clearance done – ready for final gate-out recording.
  base({
    id: 'a8', type: 'sales', no: 'SLS-0008', stage: 'CLEARED', date: iso(1020),
    party: 'Krishna Steel Corp', acName: 'Krishna Steel – Bhilai', orderRef: 'SO/26/060', rate: 59500, reqQty: 14,
    billingInfo: { party: 'Krishna Steel Corp', address: 'Steel Market, Bhilai, CG', gst: '22AAFCK4455L1Z7', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 7788', driver: 'Vijay', mobile: '9876500099', from: 'Urla, Raipur', to: 'Bhilai, CG' },
    items: [{ desc: 'MS Round Tube', size: '32 NB', grade: 'YST-240', reqQty: 14, planQty: 14 }],
    freight: 9000,
    gateIn: { time: iso(980), by: 'Suresh (Gate)' },
    tare: { weight: 13900, photo: '', remark: '', method: 'manual', time: iso(970), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(960), end: iso(880), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 27650, photo: '', remark: '', method: 'manual', time: iso(860), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 13.75, rate: 59500, basic: 818125, gauge: 0, extra: 0, freight: 9000, other: 0,
      taxable: 827125, gstPct: 18, gstAmt: 148883, total: 976008,
      invoiceNo: 'INV/26/0165', ewayBill: 'EWB7712850004', remark: '', time: iso(820), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(780), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(740), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0002', biltyNo: 'LR-2026-0002' },
    clearance: { time: iso(700), by: 'Suresh (Gate)' },
  }),
  // 9. Fully completed – gate-out done, vehicle released.
  base({
    id: 'a9', type: 'sales', no: 'SLS-0009', stage: 'OUT', date: iso(1500),
    party: 'Shree Steel Traders', acName: 'Shree Steel Traders – Raipur', orderRef: 'SO/26/040', rate: 61200, reqQty: 16,
    billingInfo: { party: 'Shree Steel Traders', address: 'Transport Nagar, Nagpur, MH', gst: '27ABCDE1234F1Z5', instr: '' },
    transport: { name: 'Singh Transport', vehicle: 'CG04 MM 9900', driver: 'Ashok', mobile: '9876500100', from: 'Urla, Raipur', to: 'Nagpur, MH' },
    items: [{ desc: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', reqQty: 16, planQty: 16 }],
    freight: 30000,
    gateIn: { time: iso(1440), by: 'Suresh (Gate)' },
    tare: { weight: 14300, photo: '', remark: '', method: 'manual', time: iso(1430), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1420), end: iso(1340), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 30550, photo: '', remark: '', method: 'manual', time: iso(1320), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 16.25, rate: 61200, basic: 994500, gauge: 0, extra: 0, freight: 30000, other: 0,
      taxable: 1024500, gstPct: 18, gstAmt: 184410, total: 1208910,
      invoiceNo: 'INV/26/0140', ewayBill: 'EWB7712840005', remark: '', time: iso(1280), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(1240), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(1200), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0003', biltyNo: 'LR-2026-0003' },
    clearance: { time: iso(1160), by: 'Suresh (Gate)' },
    gateOut: { time: iso(1140), by: 'Suresh (Gate)' },
  }),

  // ── Purchase (Unloading) ──────────────────────────────────────────────
  // 1. Advice created, truck not yet arrived.
  base({
    id: 'p1', type: 'purchase', no: 'PUR-0001', stage: 'CREATED', date: iso(60),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/045', rate: 54000, reqQty: 25,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 9090', driver: 'Mohan', mobile: '9876500044', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 25, planQty: 25 }],
    remarks: { special: '', customer: '', packing: '', handling: 'Unload with EOT crane' },
    freight: 21000,
  }),
  // 2. Gate-In done with supplier's bilty recorded – waiting at weighbridge.
  base({
    id: 'p2', type: 'purchase', no: 'PUR-0002', stage: 'GATED_IN', date: iso(200),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/041', rate: 52500, reqQty: 20,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 3322', driver: 'Nandlal', mobile: '9876500111', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 20, planQty: 20 }],
    freight: 15000,
    gateIn: { time: iso(170), by: 'Suresh (Gate)', biltyNo: 'BHS-55210', invoiceNo: 'BHS/INV/990', ewayBill: 'EWB8812011' },
  }),
  // 3. 1st weight (loaded) done – truck gone to unloading yard.
  base({
    id: 'p3', type: 'purchase', no: 'PUR-0003', stage: 'TARE_DONE', date: iso(400),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/038', rate: 53500, reqQty: 23,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 1212', driver: 'Biswajit', mobile: '9876500133', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 23, planQty: 23 }],
    freight: 24000,
    gateIn: { time: iso(380), by: 'Suresh (Gate)', biltyNo: 'SSI-33109', invoiceNo: 'SSI/INV/112', ewayBill: 'EWB8812055' },
    tare: { weight: 37200, photo: '', remark: 'Loaded truck weighed first', method: 'manual', time: iso(370), by: 'Mahesh (Weighbridge)' },
  }),
  // 4. Unloading done – truck gone back to weighbridge for final (empty) weight.
  base({
    id: 'p4', type: 'purchase', no: 'PUR-0004', stage: 'LOADED', date: iso(500),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/033', rate: 52800, reqQty: 19,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 4433', driver: 'Ramesh', mobile: '9876500144', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 19, planQty: 19 }],
    freight: 14500,
    gateIn: { time: iso(480), by: 'Suresh (Gate)', biltyNo: 'BHS-55233', invoiceNo: 'BHS/INV/1002', ewayBill: 'EWB8812066' },
    tare: { weight: 33800, photo: '', remark: '', method: 'manual', time: iso(470), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(460), end: iso(390), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
  }),
  // 5. Final (empty) weight done – waiting for billing.
  base({
    id: 'p5', type: 'purchase', no: 'PUR-0005', stage: 'FINAL_DONE', date: iso(650),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/028', rate: 54000, reqQty: 24,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 5522', driver: 'Dilip', mobile: '9876500155', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 24, planQty: 24 }],
    freight: 20000,
    gateIn: { time: iso(630), by: 'Suresh (Gate)', biltyNo: 'JCL-77140', invoiceNo: 'JCL/INV/470', ewayBill: 'EWB8812077' },
    tare: { weight: 38500, photo: '', remark: '', method: 'manual', time: iso(620), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(610), end: iso(540), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14600, photo: '', remark: 'Empty weight after unloading', method: 'manual', time: iso(520), by: 'Mahesh (Weighbridge)' },
  }),
  // 6. Billed – waiting for dispatch's document verification.
  base({
    id: 'p6', type: 'purchase', no: 'PUR-0006', stage: 'BILLED', date: iso(800),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/020', rate: 53200, reqQty: 21,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 2233', driver: 'Tapan', mobile: '9876500166', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 21, planQty: 21 }],
    freight: 22500,
    gateIn: { time: iso(780), by: 'Suresh (Gate)', biltyNo: 'SSI-33150', invoiceNo: 'SSI/INV/140', ewayBill: 'EWB8812088' },
    tare: { weight: 35300, photo: '', remark: '', method: 'manual', time: iso(770), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(760), end: iso(690), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14100, photo: '', remark: '', method: 'manual', time: iso(670), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 21.2, rate: 53200, basic: 1127840, gauge: 0, extra: 0, freight: 22500, other: 0,
      taxable: 1150340, gstPct: 18, gstAmt: 207061, total: 1357401,
      invoiceNo: 'SSI/INV/140', ewayBill: 'EWB8812088', remark: '', time: iso(630), by: 'Vinod (Accounts)',
    },
  }),
  // 7. Documents verified – gate pass still to be generated.
  base({
    id: 'p7', type: 'purchase', no: 'PUR-0007', stage: 'DOC_OK', date: iso(950),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/015', rate: 52600, reqQty: 18,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 6644', driver: 'Lalit', mobile: '9876500177', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 18, planQty: 18 }],
    freight: 13500,
    gateIn: { time: iso(930), by: 'Suresh (Gate)', biltyNo: 'BHS-55280', invoiceNo: 'BHS/INV/1050', ewayBill: 'EWB8812099' },
    tare: { weight: 32500, photo: '', remark: '', method: 'manual', time: iso(920), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(910), end: iso(840), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 13900, photo: '', remark: '', method: 'manual', time: iso(820), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 18.6, rate: 52600, basic: 978360, gauge: 0, extra: 0, freight: 13500, other: 0,
      taxable: 991860, gstPct: 18, gstAmt: 178535, total: 1170395,
      invoiceNo: 'BHS/INV/1050', ewayBill: 'EWB8812099', remark: '', time: iso(780), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(740), by: 'Anil (Dispatch)' },
  }),
  // 8. Gate pass issued – waiting at main gate for security clearance.
  base({
    id: 'p8', type: 'purchase', no: 'PUR-0008', stage: 'GATEPASS', date: iso(1100),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/010', rate: 54400, reqQty: 24,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 7733', driver: 'Ganesh', mobile: '9876500188', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 24, planQty: 24 }],
    freight: 19500,
    gateIn: { time: iso(1080), by: 'Suresh (Gate)', biltyNo: 'JCL-77190', invoiceNo: 'JCL/INV/510', ewayBill: 'EWB8812110' },
    tare: { weight: 38900, photo: '', remark: '', method: 'manual', time: iso(1070), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1060), end: iso(990), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14700, photo: '', remark: '', method: 'manual', time: iso(970), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 24.2, rate: 54400, basic: 1316480, gauge: 0, extra: 0, freight: 19500, other: 0,
      taxable: 1335980, gstPct: 18, gstAmt: 240476, total: 1576456,
      invoiceNo: 'JCL/INV/510', ewayBill: 'EWB8812110', remark: '', time: iso(930), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(890), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(850), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0005' },
  }),
  // 9. Security clearance done – ready for final gate-out recording.
  base({
    id: 'p9', type: 'purchase', no: 'PUR-0009', stage: 'CLEARED', date: iso(1250),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/005', rate: 53800, reqQty: 22,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 3344', driver: 'Subrata', mobile: '9876500199', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 22, planQty: 22 }],
    freight: 21500,
    gateIn: { time: iso(1230), by: 'Suresh (Gate)', biltyNo: 'SSI-33200', invoiceNo: 'SSI/INV/180', ewayBill: 'EWB8812121' },
    tare: { weight: 36800, photo: '', remark: '', method: 'manual', time: iso(1220), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1210), end: iso(1140), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14400, photo: '', remark: '', method: 'manual', time: iso(1120), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 22.4, rate: 53800, basic: 1205120, gauge: 0, extra: 0, freight: 21500, other: 0,
      taxable: 1226620, gstPct: 18, gstAmt: 220792, total: 1447412,
      invoiceNo: 'SSI/INV/180', ewayBill: 'EWB8812121', remark: '', time: iso(1080), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(1040), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(1000), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0006' },
    clearance: { time: iso(960), by: 'Suresh (Gate)' },
  }),
  // 10. Fully completed purchase – gate-out done.
  base({
    id: 'p10', type: 'purchase', no: 'PUR-0010', stage: 'OUT', date: iso(2000),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/030', rate: 54200, reqQty: 22,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 4411', driver: 'Suraj', mobile: '9876500122', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 22, planQty: 22 }],
    freight: 18500,
    gateIn: { time: iso(1950), by: 'Suresh (Gate)', biltyNo: 'JCL-77102', invoiceNo: 'JCL/INV/450', ewayBill: 'EWB8811900' },
    tare: { weight: 36500, photo: '', remark: 'Loaded truck weighed first', method: 'manual', time: iso(1940), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1930), end: iso(1820), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14500, photo: '', remark: 'Empty weight after unloading', method: 'manual', time: iso(1800), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 22, rate: 54200, basic: 1192400, gauge: 0, extra: 0, freight: 18500, other: 0,
      taxable: 1210900, gstPct: 18, gstAmt: 217962, total: 1428862,
      invoiceNo: 'JCL/INV/450', ewayBill: 'EWB8811900', remark: '', time: iso(1760), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(1720), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(1680), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0004' },
    clearance: { time: iso(1640), by: 'Suresh (Gate)' },
    gateOut: { time: iso(1620), by: 'Suresh (Gate)' },
  }),

  // ═══ Extra dummy trucks (testing) – one more per stage, both subsystems ═══
  base({
    id: 'a10', type: 'sales', no: 'SLS-0010', stage: 'CREATED', date: iso(25),
    party: 'Gupta Steel Agency', acName: 'Gupta Steel – Jagdalpur', orderRef: 'SO/26/125', rate: 61800, reqQty: 7,
    billingInfo: { party: 'Gupta Steel Agency', address: 'Main Road, Jagdalpur, CG', gst: '22AAGSA6677P1Z3', instr: '' },
    transport: { name: 'Jagdalpur Carriers', vehicle: 'CG17 JJ 2020', driver: 'Naresh', mobile: '9876500211', from: 'Urla, Raipur', to: 'Jagdalpur, CG' },
    items: [{ desc: 'MS Square Tube', size: '25x25x2.0 mm', grade: 'YST-210', reqQty: 7, planQty: 7 }],
    freightTerms: 'ex', freight: 0, // Ex-Works – party is collecting with its own vehicle
  }),
  base({
    id: 'a11', type: 'sales', no: 'SLS-0011', stage: 'GATED_IN', date: iso(160),
    party: 'Agarwal Pipe House', acName: 'Agarwal Pipe House – Rajnandgaon', orderRef: 'SO/26/128', rate: 60500, reqQty: 13,
    billingInfo: { party: 'Agarwal Pipe House', address: 'GE Road, Rajnandgaon, CG', gst: '22AAAPH9900Q1Z8', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 3131', driver: 'Yogesh', mobile: '9876500222', from: 'Urla, Raipur', to: 'Rajnandgaon, CG' },
    items: [{ desc: 'MS Round Tube', size: '40 NB', grade: 'YST-240', reqQty: 13, planQty: 13 }],
    freight: 10000,
    gateIn: { time: iso(140), by: 'Suresh (Gate)' },
  }),
  base({
    id: 'a12', type: 'sales', no: 'SLS-0012', stage: 'TARE_DONE', date: iso(260),
    party: 'Balaji Infra Pvt Ltd', acName: 'Balaji Infra – Bilaspur', orderRef: 'SO/26/131', rate: 62000, reqQty: 11,
    billingInfo: { party: 'Balaji Infra Pvt Ltd', address: 'Link Road, Bilaspur, CG', gst: '22AAACB5678K1Z2', instr: '' },
    transport: { name: 'Singh Transport', vehicle: 'CG04 MM 4242', driver: 'Girish', mobile: '9876500233', from: 'Urla, Raipur', to: 'Bilaspur, CG' },
    items: [{ desc: 'MS Rectangular Tube', size: '50x50x2.5 mm', grade: 'YST-210', reqQty: 11, planQty: 11 }],
    freight: 11500,
    gateIn: { time: iso(240), by: 'Suresh (Gate)' },
    tare: { weight: 14000, photo: '', remark: '', method: 'manual', time: iso(230), by: 'Mahesh (Weighbridge)' },
  }),
  base({
    id: 'a13', type: 'sales', no: 'SLS-0013', stage: 'LOADED', date: iso(340),
    party: 'Om Hardware', acName: 'Om Hardware – Durg', orderRef: 'SO/26/133', rate: 60800, reqQty: 10,
    billingInfo: { party: 'Om Hardware', address: 'Station Road, Durg, CG', gst: '22AAHFO9988M1Z9', instr: '' },
    transport: { name: 'Mahakal Roadlines', vehicle: 'CG04 AB 5353', driver: 'Bhagat', mobile: '9876500244', from: 'Urla, Raipur', to: 'Durg, CG' },
    items: [{ desc: 'MS Round Tube', size: '25 NB', grade: 'YST-240', reqQty: 10, planQty: 10 }],
    freight: 7200,
    gateIn: { time: iso(320), by: 'Suresh (Gate)' },
    tare: { weight: 13750, photo: '', remark: '', method: 'manual', time: iso(310), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(300), end: iso(230), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
  }),
  base({
    id: 'a14', type: 'sales', no: 'SLS-0014', stage: 'FINAL_DONE', date: iso(460),
    party: 'Shree Steel Traders', acName: 'Shree Steel Traders – Raipur', orderRef: 'SO/26/135', rate: 61500, reqQty: 17,
    billingInfo: { party: 'Shree Steel Traders', address: 'Transport Nagar, Nagpur, MH', gst: '27ABCDE1234F1Z5', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 6464', driver: 'Omkar', mobile: '9876500255', from: 'Urla, Raipur', to: 'Nagpur, MH' },
    items: [{ desc: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', reqQty: 17, planQty: 17 }],
    freight: 31000,
    gateIn: { time: iso(430), by: 'Suresh (Gate)' },
    tare: { weight: 14150, photo: '', remark: '', method: 'manual', time: iso(420), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(410), end: iso(340), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 31350, photo: '', remark: '', method: 'manual', time: iso(320), by: 'Mahesh (Weighbridge)' },
  }),
  base({
    id: 'a15', type: 'sales', no: 'SLS-0015', stage: 'BILLED', date: iso(640),
    party: 'Krishna Steel Corp', acName: 'Krishna Steel – Bhilai', orderRef: 'SO/26/095', rate: 59500, reqQty: 12,
    billingInfo: { party: 'Krishna Steel Corp', address: 'Steel Market, Bhilai, CG', gst: '22AAFCK4455L1Z7', instr: '' },
    transport: { name: 'Mahakal Roadlines', vehicle: 'CG04 AB 7575', driver: 'Tarun', mobile: '9876500266', from: 'Urla, Raipur', to: 'Bhilai, CG' },
    items: [{ desc: 'MS Round Tube', size: '32 NB', grade: 'YST-240', reqQty: 12, planQty: 12 }],
    freight: 8000,
    gateIn: { time: iso(600), by: 'Suresh (Gate)' },
    tare: { weight: 13950, photo: '', remark: '', method: 'manual', time: iso(590), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(580), end: iso(500), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 25950, photo: '', remark: '', method: 'manual', time: iso(480), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 12, rate: 59500, basic: 714000, gauge: 0, extra: 0, freight: 8000, other: 0,
      taxable: 722000, gstPct: 18, gstAmt: 129960, total: 851960,
      invoiceNo: 'INV/26/0212', ewayBill: 'EWB7712890006', remark: '', time: iso(440), by: 'Vinod (Accounts)',
    },
  }),
  base({
    id: 'a16', type: 'sales', no: 'SLS-0016', stage: 'DOC_OK', date: iso(820),
    party: 'Gupta Steel Agency', acName: 'Gupta Steel – Jagdalpur', orderRef: 'SO/26/078', rate: 61800, reqQty: 9,
    billingInfo: { party: 'Gupta Steel Agency', address: 'Main Road, Jagdalpur, CG', gst: '22AAGSA6677P1Z3', instr: '' },
    transport: { name: 'Jagdalpur Carriers', vehicle: 'CG17 JJ 8686', driver: 'Dayaram', mobile: '9876500277', from: 'Urla, Raipur', to: 'Jagdalpur, CG' },
    items: [{ desc: 'MS Square Tube', size: '25x25x2.0 mm', grade: 'YST-210', reqQty: 9, planQty: 9 }],
    freight: 12500,
    gateIn: { time: iso(780), by: 'Suresh (Gate)' },
    tare: { weight: 13700, photo: '', remark: '', method: 'manual', time: iso(770), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(760), end: iso(690), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 22400, photo: '', remark: '', method: 'manual', time: iso(670), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 8.7, rate: 61800, basic: 537660, gauge: 0, extra: 0, freight: 12500, other: 0,
      taxable: 550160, gstPct: 18, gstAmt: 99029, total: 649189,
      invoiceNo: 'INV/26/0188', ewayBill: 'EWB7712880007', remark: '', time: iso(630), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(600), by: 'Anil (Dispatch)' },
  }),
  base({
    id: 'a17', type: 'sales', no: 'SLS-0017', stage: 'GATEPASS', date: iso(940),
    party: 'Agarwal Pipe House', acName: 'Agarwal Pipe House – Rajnandgaon', orderRef: 'SO/26/065', rate: 60500, reqQty: 14,
    billingInfo: { party: 'Agarwal Pipe House', address: 'GE Road, Rajnandgaon, CG', gst: '22AAAPH9900Q1Z8', instr: '' },
    transport: { name: 'Singh Transport', vehicle: 'CG04 MM 9797', driver: 'Pankaj', mobile: '9876500288', from: 'Urla, Raipur', to: 'Rajnandgaon, CG' },
    items: [{ desc: 'MS Round Tube', size: '40 NB', grade: 'YST-240', reqQty: 14, planQty: 14 }],
    freight: 10500,
    gateIn: { time: iso(900), by: 'Suresh (Gate)' },
    tare: { weight: 14200, photo: '', remark: '', method: 'manual', time: iso(890), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(880), end: iso(810), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 28100, photo: '', remark: '', method: 'manual', time: iso(790), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 13.9, rate: 60500, basic: 840950, gauge: 0, extra: 0, freight: 10500, other: 0,
      taxable: 851450, gstPct: 18, gstAmt: 153261, total: 1004711,
      invoiceNo: 'INV/26/0170', ewayBill: 'EWB7712870008', remark: '', time: iso(750), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(710), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(670), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0007', biltyNo: 'LR-2026-0004' },
  }),
  base({
    id: 'a18', type: 'sales', no: 'SLS-0018', stage: 'CLEARED', date: iso(1060),
    party: 'Om Hardware', acName: 'Om Hardware – Durg', orderRef: 'SO/26/050', rate: 60800, reqQty: 10,
    billingInfo: { party: 'Om Hardware', address: 'Station Road, Durg, CG', gst: '22AAHFO9988M1Z9', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 1818', driver: 'Suman', mobile: '9876500299', from: 'Urla, Raipur', to: 'Durg, CG' },
    items: [{ desc: 'MS Round Tube', size: '25 NB', grade: 'YST-240', reqQty: 10, planQty: 10 }],
    freight: 7000,
    gateIn: { time: iso(1020), by: 'Suresh (Gate)' },
    tare: { weight: 13800, photo: '', remark: '', method: 'manual', time: iso(1010), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1000), end: iso(930), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 23900, photo: '', remark: '', method: 'manual', time: iso(910), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 10.1, rate: 60800, basic: 614080, gauge: 0, extra: 0, freight: 7000, other: 0,
      taxable: 621080, gstPct: 18, gstAmt: 111794, total: 732874,
      invoiceNo: 'INV/26/0155', ewayBill: 'EWB7712860009', remark: '', time: iso(870), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(830), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(790), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0008', biltyNo: 'LR-2026-0005' },
    clearance: { time: iso(750), by: 'Suresh (Gate)' },
  }),
  base({
    id: 'a19', type: 'sales', no: 'SLS-0019', stage: 'OUT', date: iso(1550),
    party: 'Krishna Steel Corp', acName: 'Krishna Steel – Bhilai', orderRef: 'SO/26/035', rate: 59500, reqQty: 13,
    billingInfo: { party: 'Krishna Steel Corp', address: 'Steel Market, Bhilai, CG', gst: '22AAFCK4455L1Z7', instr: '' },
    transport: { name: 'Mahakal Roadlines', vehicle: 'CG04 AB 2929', driver: 'Irfan', mobile: '9876500300', from: 'Urla, Raipur', to: 'Bhilai, CG' },
    items: [{ desc: 'MS Round Tube', size: '32 NB', grade: 'YST-240', reqQty: 13, planQty: 13 }],
    freight: 8500,
    gateIn: { time: iso(1500), by: 'Suresh (Gate)' },
    tare: { weight: 14050, photo: '', remark: '', method: 'manual', time: iso(1490), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1480), end: iso(1410), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 27100, photo: '', remark: '', method: 'manual', time: iso(1390), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 13.05, rate: 59500, basic: 776475, gauge: 0, extra: 0, freight: 8500, other: 0,
      taxable: 784975, gstPct: 18, gstAmt: 141296, total: 926271,
      invoiceNo: 'INV/26/0130', ewayBill: 'EWB7712850010', remark: '', time: iso(1350), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(1310), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(1270), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0009', biltyNo: 'LR-2026-0006' },
    clearance: { time: iso(1230), by: 'Suresh (Gate)' },
    gateOut: { time: iso(1210), by: 'Suresh (Gate)' },
  }),

  base({
    id: 'p11', type: 'purchase', no: 'PUR-0011', stage: 'CREATED', date: iso(35),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/052', rate: 53700, reqQty: 20,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 4455', driver: 'Partha', mobile: '9876500311', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 20, planQty: 20 }],
    freightTerms: 'for', freight: 0, // FOR – supplier delivers to the plant, freight paid by the supplier
  }),
  base({
    id: 'p12', type: 'purchase', no: 'PUR-0012', stage: 'GATED_IN', date: iso(220),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/048', rate: 54000, reqQty: 23,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 5566', driver: 'Jitendra', mobile: '9876500322', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 23, planQty: 23 }],
    freight: 19000,
    gateIn: { time: iso(190), by: 'Suresh (Gate)', biltyNo: 'JCL-77215', invoiceNo: 'JCL/INV/530', ewayBill: 'EWB8812140' },
  }),
  base({
    id: 'p13', type: 'purchase', no: 'PUR-0013', stage: 'TARE_DONE', date: iso(420),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/043', rate: 52500, reqQty: 18,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 6677', driver: 'Ranjit', mobile: '9876500333', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 18, planQty: 18 }],
    freight: 13500,
    gateIn: { time: iso(400), by: 'Suresh (Gate)', biltyNo: 'BHS-55310', invoiceNo: 'BHS/INV/1110', ewayBill: 'EWB8812150' },
    tare: { weight: 32400, photo: '', remark: '', method: 'manual', time: iso(390), by: 'Mahesh (Weighbridge)' },
  }),
  base({
    id: 'p14', type: 'purchase', no: 'PUR-0014', stage: 'LOADED', date: iso(530),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/036', rate: 53500, reqQty: 21,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 7788', driver: 'Ananda', mobile: '9876500344', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 21, planQty: 21 }],
    freight: 22000,
    gateIn: { time: iso(500), by: 'Suresh (Gate)', biltyNo: 'SSI-33260', invoiceNo: 'SSI/INV/160', ewayBill: 'EWB8812160' },
    tare: { weight: 35600, photo: '', remark: '', method: 'manual', time: iso(490), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(480), end: iso(410), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
  }),
  base({
    id: 'p15', type: 'purchase', no: 'PUR-0015', stage: 'FINAL_DONE', date: iso(680),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/025', rate: 52800, reqQty: 19,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 8899', driver: 'Mahendra', mobile: '9876500355', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 19, planQty: 19 }],
    freight: 14800,
    gateIn: { time: iso(660), by: 'Suresh (Gate)', biltyNo: 'BHS-55345', invoiceNo: 'BHS/INV/1150', ewayBill: 'EWB8812170' },
    tare: { weight: 33900, photo: '', remark: '', method: 'manual', time: iso(650), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(640), end: iso(570), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14450, photo: '', remark: 'Empty weight after unloading', method: 'manual', time: iso(550), by: 'Mahesh (Weighbridge)' },
  }),
  base({
    id: 'p16', type: 'purchase', no: 'PUR-0016', stage: 'BILLED', date: iso(830),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/018', rate: 54000, reqQty: 24,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 9988', driver: 'Harish', mobile: '9876500366', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 24, planQty: 24 }],
    freight: 20000,
    gateIn: { time: iso(810), by: 'Suresh (Gate)', biltyNo: 'JCL-77260', invoiceNo: 'JCL/INV/560', ewayBill: 'EWB8812180' },
    tare: { weight: 39000, photo: '', remark: '', method: 'manual', time: iso(800), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(790), end: iso(720), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14900, photo: '', remark: '', method: 'manual', time: iso(700), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 24.1, rate: 54000, basic: 1301400, gauge: 0, extra: 0, freight: 20000, other: 0,
      taxable: 1321400, gstPct: 18, gstAmt: 237852, total: 1559252,
      invoiceNo: 'JCL/INV/560', ewayBill: 'EWB8812180', remark: '', time: iso(660), by: 'Vinod (Accounts)',
    },
  }),
  base({
    id: 'p17', type: 'purchase', no: 'PUR-0017', stage: 'DOC_OK', date: iso(980),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/012', rate: 53000, reqQty: 20,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 1010', driver: 'Soumen', mobile: '9876500377', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 20, planQty: 20 }],
    freight: 21000,
    gateIn: { time: iso(960), by: 'Suresh (Gate)', biltyNo: 'SSI-33300', invoiceNo: 'SSI/INV/200', ewayBill: 'EWB8812190' },
    tare: { weight: 34700, photo: '', remark: '', method: 'manual', time: iso(950), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(940), end: iso(870), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14250, photo: '', remark: '', method: 'manual', time: iso(850), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 20.45, rate: 53000, basic: 1083850, gauge: 0, extra: 0, freight: 21000, other: 0,
      taxable: 1104850, gstPct: 18, gstAmt: 198873, total: 1303723,
      invoiceNo: 'SSI/INV/200', ewayBill: 'EWB8812190', remark: '', time: iso(810), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(770), by: 'Anil (Dispatch)' },
  }),
  base({
    id: 'p18', type: 'purchase', no: 'PUR-0018', stage: 'GATEPASS', date: iso(1130),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/008', rate: 52600, reqQty: 17,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 2121', driver: 'Kailash', mobile: '9876500388', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 17, planQty: 17 }],
    freight: 12800,
    gateIn: { time: iso(1110), by: 'Suresh (Gate)', biltyNo: 'BHS-55390', invoiceNo: 'BHS/INV/1200', ewayBill: 'EWB8812200' },
    tare: { weight: 31800, photo: '', remark: '', method: 'manual', time: iso(1100), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1090), end: iso(1020), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 13800, photo: '', remark: '', method: 'manual', time: iso(1000), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 18, rate: 52600, basic: 946800, gauge: 0, extra: 0, freight: 12800, other: 0,
      taxable: 959600, gstPct: 18, gstAmt: 172728, total: 1132328,
      invoiceNo: 'BHS/INV/1200', ewayBill: 'EWB8812200', remark: '', time: iso(960), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(920), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(880), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0010' },
  }),
  base({
    id: 'p19', type: 'purchase', no: 'PUR-0019', stage: 'CLEARED', date: iso(1280),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/003', rate: 54400, reqQty: 23,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 3232', driver: 'Umesh', mobile: '9876500399', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 23, planQty: 23 }],
    freight: 19500,
    gateIn: { time: iso(1260), by: 'Suresh (Gate)', biltyNo: 'JCL-77310', invoiceNo: 'JCL/INV/610', ewayBill: 'EWB8812210' },
    tare: { weight: 37900, photo: '', remark: '', method: 'manual', time: iso(1250), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(1240), end: iso(1170), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14600, photo: '', remark: '', method: 'manual', time: iso(1150), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 23.3, rate: 54400, basic: 1267520, gauge: 0, extra: 0, freight: 19500, other: 0,
      taxable: 1287020, gstPct: 18, gstAmt: 231664, total: 1518684,
      invoiceNo: 'JCL/INV/610', ewayBill: 'EWB8812210', remark: '', time: iso(1110), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(1070), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(1030), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0011' },
    clearance: { time: iso(990), by: 'Suresh (Gate)' },
  }),
  base({
    id: 'p20', type: 'purchase', no: 'PUR-0020', stage: 'OUT', date: iso(2100),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/001', rate: 53600, reqQty: 20,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 4343', driver: 'Gautam', mobile: '9876500400', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 20, planQty: 20 }],
    freight: 18000,
    gateIn: { time: iso(2050), by: 'Suresh (Gate)', biltyNo: 'SSI-33400', invoiceNo: 'SSI/INV/260', ewayBill: 'EWB8812220' },
    tare: { weight: 34500, photo: '', remark: '', method: 'manual', time: iso(2040), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(2030), end: iso(1960), delayMin: 0, delayReason: '', by: 'Dinesh (Loading)' },
    final: { weight: 14300, photo: '', remark: '', method: 'manual', time: iso(1940), by: 'Mahesh (Weighbridge)' },
    billing: {
      qty: 20.2, rate: 53600, basic: 1082720, gauge: 0, extra: 0, freight: 18000, other: 0,
      taxable: 1100720, gstPct: 18, gstAmt: 198130, total: 1298850,
      invoiceNo: 'SSI/INV/260', ewayBill: 'EWB8812220', remark: '', time: iso(1900), by: 'Vinod (Accounts)',
    },
    docVerify: { remark: '', time: iso(1860), by: 'Anil (Dispatch)' },
    dispatch: { remark: '', time: iso(1820), by: 'Anil (Dispatch)', gatePassNo: 'GP-2026-0012' },
    clearance: { time: iso(1780), by: 'Suresh (Gate)' },
    gateOut: { time: iso(1760), by: 'Suresh (Gate)' },
  }),

  // ═══ More testing trucks – fill the Loading/Unloading start & end tabs, delays, GRN deviation ═══
  base({
    id: 'a20', type: 'sales', no: 'SLS-0020', stage: 'TARE_DONE', date: iso(330),
    party: 'Gupta Steel Agency', acName: 'Gupta Steel – Jagdalpur', orderRef: 'SO/26/137', rate: 61800, reqQty: 8,
    billingInfo: { party: 'Gupta Steel Agency', address: 'Main Road, Jagdalpur, CG', gst: '22AAGSA6677P1Z3', instr: '' },
    transport: { name: 'Jagdalpur Carriers', vehicle: 'CG17 JJ 4141', driver: 'Ramesh', mobile: '9876500411', from: 'Urla, Raipur', to: 'Jagdalpur, CG' },
    items: [{ desc: 'MS Square Tube', size: '25x25x2.0 mm', grade: 'YST-210', reqQty: 8, planQty: 8 }],
    freight: 11500,
    gateIn: { time: iso(310), by: 'Suresh (Gate)' },
    tare: { weight: 13900, photo: '', remark: '', method: 'manual', time: iso(300), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(190), by: 'Dinesh (Loading)' }, // running 3+ hrs vs 2 hr target → delay reason will be asked
  }),
  base({
    id: 'a21', type: 'sales', no: 'SLS-0021', stage: 'TARE_DONE', date: iso(120),
    party: 'Agarwal Pipe House', acName: 'Agarwal Pipe House – Rajnandgaon', orderRef: 'SO/26/138', rate: 60500, reqQty: 9,
    billingInfo: { party: 'Agarwal Pipe House', address: 'GE Road, Rajnandgaon, CG', gst: '22AAAPH9900Q1Z8', instr: '' },
    transport: { name: 'Raipur Carriers', vehicle: 'CG07 XY 5151', driver: 'Mohan', mobile: '9876500422', from: 'Urla, Raipur', to: 'Rajnandgaon, CG' },
    items: [{ desc: 'MS Round Tube', size: '40 NB', grade: 'YST-240', reqQty: 9, planQty: 9 }],
    freight: 9500,
    gateIn: { time: iso(100), by: 'Suresh (Gate)' },
    tare: { weight: 13850, photo: '', remark: '', method: 'manual', time: iso(90), by: 'Mahesh (Weighbridge)' },
  }),
  base({
    id: 'p21', type: 'purchase', no: 'PUR-0021', stage: 'TARE_DONE', date: iso(150),
    party: 'Jindal Coils Ltd', acName: 'Jindal Coils – Raigarh', orderRef: 'PO/26/055', rate: 54000, reqQty: 22,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bharat Logistics', vehicle: 'CG13 RR 6161', driver: 'Prem', mobile: '9876500433', from: 'Raigarh, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 22, planQty: 22 }],
    freight: 19000,
    gateIn: { time: iso(130), by: 'Suresh (Gate)', biltyNo: 'JCL-77330', invoiceNo: 'JCL/INV/640', ewayBill: 'EWB8812230' },
    tare: { weight: 36900, photo: '', remark: '', method: 'manual', time: iso(120), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(60), by: 'Dinesh (Loading)' }, // 1 hr into a 3 hr unloading – on time
  }),
  base({
    id: 'p22', type: 'purchase', no: 'PUR-0022', stage: 'TARE_DONE', date: iso(360),
    party: 'Bhilai Steel Suppliers', acName: 'Bhilai Steel – Bhilai', orderRef: 'PO/26/056', rate: 52500, reqQty: 19,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Bhilai Transport Co.', vehicle: 'CG06 BB 7171', driver: 'Sunil', mobile: '9876500444', from: 'Bhilai, CG', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', reqQty: 19, planQty: 19 }],
    freight: 14000,
    gateIn: { time: iso(340), by: 'Suresh (Gate)', biltyNo: 'BHS-55420', invoiceNo: 'BHS/INV/1240', ewayBill: 'EWB8812240' },
    tare: { weight: 33500, photo: '', remark: '', method: 'manual', time: iso(330), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(250), by: 'Dinesh (Loading)' }, // 4+ hrs vs 3 hr target → delay reason will be asked
  }),
  base({
    id: 'p23', type: 'purchase', no: 'PUR-0023', stage: 'CLEARED', date: iso(900),
    party: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', orderRef: 'PO/26/047', rate: 53500, reqQty: 22,
    billingInfo: { party: 'M/s Pawan Putra Tubes', address: 'Urla Guma Road, Borjhara, Raipur', gst: '22AAKFP1234Q1ZX', instr: '' },
    transport: { name: 'Shyam Carriers', vehicle: 'WB05 KK 8181', driver: 'Dipankar', mobile: '9876500455', from: 'Durgapur, WB', to: 'Urla, Raipur' },
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', reqQty: 22, planQty: 22 }],
    freight: 23000,
    gateIn: { time: iso(880), by: 'Suresh (Gate)', biltyNo: 'SSI-33450', invoiceNo: 'SSI/INV/300', ewayBill: 'EWB8812250' },
    tare: { weight: 36200, photo: '', remark: '', method: 'manual', time: iso(870), by: 'Mahesh (Weighbridge)' },
    loading: { start: iso(860), end: iso(640), delayMin: 40, delayReason: 'Crane breakdown, stopped for 40 minutes', by: 'Dinesh (Loading)' },
    final: { weight: 14600, photo: '', remark: '', method: 'manual', time: iso(620), by: 'Mahesh (Weighbridge)' },
    grn: { grnNo: 'GRN-2026-0023', netQty: 21.6, invoiceQty: 22, quality: 'Accepted with deviation', remark: '0.4 MT short – debit note to supplier', time: iso(590), by: 'Rakesh (Store)' },
  }),
];

export const SEED_ADVICES = RAW_ADVICES.map(normalizeAdvice);
// Bump whenever the demo trucks change, so browsers pick up the new set automatically.
export const SEED_VERSION = 8;

// ═══ Sales Orders & Purchase Indents (one list, `type` = subsystem) ═══
// Sales Order status: 'pending' (Order Approval) | 'approved' | 'rejected'. Older orders with no status count as approved.
export const soApproved = (o) => !o.status || o.status === 'approved';
export const INDENT_STATUS = {
  pending: { label: 'Pending Approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  po: { label: 'PO Created', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'gray' },
};

/** Ordered vs. advised vs. dispatched quantity of a Sales Order (advices are linked by orderRef = SO no.). */
export function orderProgress(o, advices) {
  const linked = advices.filter((a) => a.type === 'sales' && a.orderRef === o.no);
  const plan = (a) => a.items.reduce((s, i) => s + Number(i.planQty || 0), 0);
  const r = (n) => Math.round(n * 100) / 100;
  const ordered = r(o.items.reduce((s, i) => s + Number(i.qty || 0), 0));
  const planned = r(linked.reduce((s, a) => s + plan(a), 0));
  const dispatched = r(linked.filter((a) => a.gateOut).reduce((s, a) => s + (a.billing?.qty ?? plan(a)), 0));
  const status =
    dispatched >= ordered && ordered > 0 ? 'Completed'
      : dispatched > 0 ? 'Partly Dispatched'
      : planned >= ordered && ordered > 0 ? 'Fully Planned'
      : planned > 0 ? 'Partly Planned' : 'Open';
  return { ordered, planned, dispatched, status, advices: linked };
}

const day = (d) => new Date(now + d * 86400000).toISOString().slice(0, 10);
const SHREE = { party: 'Shree Steel Traders', address: 'Transport Nagar, Nagpur, MH', gst: '27ABCDE1234F1Z5' };
const BALAJI = { party: 'Balaji Infra Pvt Ltd', address: 'Link Road, Bilaspur, CG', gst: '22AAACB5678K1Z2' };

export const SEED_ORDERS = [
  {
    id: 'o1', type: 'sales', no: 'SO/26/118', date: day(-3), party: 'Shree Steel Traders', acName: 'Shree Steel Traders – Raipur',
    custRef: 'SST/PO/771', salesPerson: 'Ramesh (Sales)', billingInfo: SHREE, shipTo: 'Nagpur, MH',
    items: [
      { desc: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', qty: 10, rate: 61500 },
      { desc: 'MS Round Tube', size: '50 NB', grade: 'YST-240', qty: 8, rate: 61500 },
    ],
    freightTerms: 'for', deliveryDate: day(2), paymentTerms: '30 din credit', remarks: 'Mill test certificate required', by: 'Ramesh (Sales)',
  },
  {
    id: 'o2', type: 'sales', no: 'SO/26/121', date: day(-2), party: 'Balaji Infra Pvt Ltd', acName: 'Balaji Infra – Bilaspur',
    custRef: 'BIPL/4410', salesPerson: 'Ramesh (Sales)', billingInfo: BALAJI, shipTo: 'Bilaspur, CG',
    items: [{ desc: 'MS Rectangular Tube', size: '60x40x2.5 mm', grade: 'YST-210', qty: 24, rate: 62000 }],
    freightTerms: 'for', deliveryDate: day(5), paymentTerms: '50% advance', remarks: 'Send in two trucks', by: 'Ramesh (Sales)',
  },
  {
    id: 'o3', type: 'sales', no: 'SO/26/140', date: day(0), party: 'Om Hardware', acName: 'Om Hardware – Durg',
    custRef: '', salesPerson: 'Ramesh (Sales)', billingInfo: { party: 'Om Hardware', address: 'Station Road, Durg, CG', gst: '22AAHFO9988M1Z9' }, shipTo: 'Durg, CG',
    items: [{ desc: 'MS Round Tube', size: '25 NB', grade: 'YST-240', qty: 12, rate: 60800 }],
    freightTerms: 'ex', deliveryDate: day(4), paymentTerms: 'Against delivery', remarks: '', by: 'Ramesh (Sales)',
    status: 'pending', // waiting in Order Approval
  },
  {
    id: 'o4', type: 'sales', no: 'SO/26/040', date: day(-6), party: 'Shree Steel Traders', acName: 'Shree Steel Traders – Raipur',
    custRef: 'SST/PO/702', salesPerson: 'Ramesh (Sales)', billingInfo: SHREE, shipTo: 'Nagpur, MH',
    items: [{ desc: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', qty: 16, rate: 61200 }],
    freightTerms: 'for', deliveryDate: day(-4), paymentTerms: '30 din credit', remarks: '', by: 'Ramesh (Sales)',
  },

  {
    id: 'i1', type: 'purchase', no: 'IND/26/001', date: day(-5), dept: 'Production', by: 'Rakesh (Store)', requiredBy: day(1), priority: 'Urgent',
    purpose: 'Coil for tube mill line-2', suggestedSupplier: 'Shyam Steel Industries',
    items: [{ desc: 'HR Coil', size: '2.5 mm x 1250 mm', grade: 'IS 10748', qty: 20 }],
    status: 'po', approval: { by: 'Admin', time: iso(5000), remark: 'OK' },
    po: { no: 'PO/26/052', supplier: 'Shyam Steel Industries', acName: 'Shyam Steel – Durgapur', rate: 53700, freightTerms: 'for', by: 'Admin', time: iso(4800) },
  },
  {
    id: 'i2', type: 'purchase', no: 'IND/26/002', date: day(-2), dept: 'Production', by: 'Rakesh (Store)', requiredBy: day(4), priority: 'Normal',
    purpose: 'Stock for next week', suggestedSupplier: 'Jindal Coils Ltd',
    items: [{ desc: 'HR Coil', size: '3.0 mm x 1250 mm', grade: 'IS 10748', qty: 25 }],
    status: 'approved', approval: { by: 'Admin', time: iso(1500), remark: 'Rate compare karke PO do' },
  },
  {
    id: 'i3', type: 'purchase', no: 'IND/26/003', date: day(0), dept: 'Maintenance', by: 'Rakesh (Store)', requiredBy: day(3), priority: 'Normal',
    purpose: 'Strap for packing', suggestedSupplier: '',
    items: [{ desc: 'MS Packing Strap', size: '32 mm', grade: '', qty: 1.5 }],
    status: 'pending',
  },
];

// ═══ Sales & Purchase masters (Master → Products, Vendors, Payment Terms, UOM) ═══
// Fields follow the Botivate Master System documentation (Products, UOM, Vendors, Payment Terms).

// ── UOM: Name, abbreviation, description ──
export const blankUom = () => ({ name: '', abbr: '', description: '' });
export const SEED_UOMS = [
  { id: 'u-mt', name: 'Metric Ton', abbr: 'MT', description: 'Steel tubes, coils – 1000 kg' },
  { id: 'u-kg', name: 'Kilogram', abbr: 'Kg', description: '' },
  { id: 'u-nos', name: 'Numbers', abbr: 'Nos', description: 'Pieces' },
  { id: 'u-bdl', name: 'Bundle', abbr: 'Bundle', description: 'Bundle of tubes' },
  { id: 'u-coil', name: 'Coil', abbr: 'Coil', description: '' },
  { id: 'u-mtr', name: 'Meter', abbr: 'Mtr', description: '' },
];

// ── Parties (doc "Vendors"): Name, Address, Mobile (10 digits), Contact Name, GST (15), PAN (10), email, state, TDS, contact persons ──
// Only two types: 'Sales' = our customers, 'Purchase' = our suppliers.
export const VENDOR_TYPES = ['Sales', 'Purchase'];
export const PARTY_LABEL = { Sales: 'Customer', Purchase: 'Supplier' };
export const blankVendor = (type = 'Purchase') => ({
  type, name: '', address: '', mobile: '', contactName: '', gst: '', pan: '', email: '', state: '', tds: 'No', contacts: [],
});
export const SEED_VENDORS = [
  { ...blankVendor(), id: 'v1', type: 'Purchase', name: 'Jindal Steel Traders', address: 'Siltara Industrial Area, Raipur', mobile: '9827000101', contactName: 'R. K. Jain', gst: '22AABCJ1234K1Z5', pan: 'AABCJ1234K', email: 'sales@jindaltraders.in', state: 'Chhattisgarh' },
  { ...blankVendor(), id: 'v2', type: 'Purchase', name: 'Godawari Ispat Ltd', address: 'Urla Industrial Area, Raipur', mobile: '9827000202', contactName: 'Sunil Agrawal', gst: '22AACCG5678L1Z3', pan: 'AACCG5678L', email: 'dispatch@godawari.in', state: 'Chhattisgarh' },
  { ...blankVendor(), id: 'v3', type: 'Purchase', name: 'Raipur Packaging Co', address: 'Bhanpuri, Raipur', mobile: '9827000303', contactName: 'Manoj Sahu', gst: '22AAFFR9012M1Z1', pan: 'AAFFR9012M', email: '', state: 'Chhattisgarh' },
  // Customers (Sales) – the parties on the demo sales orders / advices.
  { ...blankVendor('Sales'), id: 'c1', name: 'Shree Steel Traders', address: 'Transport Nagar, Nagpur, MH', gst: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', state: 'Maharashtra' },
  { ...blankVendor('Sales'), id: 'c2', name: 'Balaji Infra Pvt Ltd', address: 'Link Road, Bilaspur, CG', gst: '22AAACB5678K1Z2', pan: 'AAACB5678K', state: 'Chhattisgarh' },
  { ...blankVendor('Sales'), id: 'c3', name: 'Om Hardware', address: 'Station Road, Durg, CG', gst: '22AAHFO9988M1Z9', pan: 'AAHFO9988M', state: 'Chhattisgarh' },
  { ...blankVendor('Sales'), id: 'c4', name: 'Krishna Steel Corp', address: 'Steel Market, Bhilai, CG', gst: '22AAFCK4455L1Z7', pan: 'AAFCK4455L', state: 'Chhattisgarh' },
];
// Doc rules: Mobile 10 digits, GST 15 chars, PAN 10 chars, valid email.
export const vendorErrors = (v) => {
  const e = {};
  if (!v.name.trim()) e.name = 'Name is required';
  if (v.mobile && !/^\d{10}$/.test(v.mobile)) e.mobile = 'Mobile must be 10 digits';
  if (v.gst && v.gst.trim().length !== 15) e.gst = 'GST must be 15 characters';
  if (v.pan && v.pan.trim().length !== 10) e.pan = 'PAN must be 10 characters';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email';
  return e;
};

// ── Payment Terms: Value (text) – add and delete only, no edit ──
export const SEED_PAYMENT_TERMS = [
  { id: 'pt1', value: 'Advance' },
  { id: 'pt2', value: '15 days credit' },
  { id: 'pt3', value: '30 days credit' },
  { id: 'pt4', value: '45 days credit' },
  { id: 'pt5', value: 'Against delivery' },
];

// ── Product group heads (the "group head" a product belongs to) ──
export const SEED_GROUP_HEADS = [
  { id: 'gh1', name: 'MS Tubes' },
  { id: 'gh2', name: 'HR Coil' },
  { id: 'gh3', name: 'Packing Material' },
];

// ── Products: Name (2–100), SKU (auto when blank, e.g. RM-0001), unit, price, item/service, item type,
//    group head, opening qty, reorder levels (MOQ, safety stock, max level), vendors ──
// Kept beside the doc fields: size + grade (an advice line is matched to a product by name + size + grade),
// use (Sales product or Purchase product – set by the Master page it is created on), HSN, GST %, store location, active.
// Field keys: code = SKU, uom = unit, rate = price, kind = item/service, category = item type,
// openingStock = opening qty, minStock = safety stock, maxStock = max level.
export const ITEM_USE = { sales: 'Sales', purchase: 'Purchase' };
// Item type → SKU prefix used when the SKU is left blank.
export const ITEM_TYPES = { 'Finished Goods': 'FG', 'Raw Material': 'RM', 'Consumable / Packing': 'CN', Spares: 'SP', Scrap: 'SC', Other: 'OT' };
export const ITEM_CATEGORIES = Object.keys(ITEM_TYPES);
export const blankItem = () => ({
  name: '', code: '', uom: 'MT', rate: '', kind: 'item', category: 'Finished Goods', groupHead: '',
  openingStock: '', moq: '', minStock: '', maxStock: '', vendorIds: [],
  size: '', grade: '', use: 'sales', hsn: '', gstPct: 18, location: '', active: true,
});
/** Next free SKU for an item type: highest PREFIX-NNNN in use + 1 (e.g. RM-0001). */
export const nextSku = (items, category) => {
  const p = (ITEM_TYPES[category] || 'OT') + '-';
  const max = items.reduce((m, x) => (x.code?.startsWith(p) && /^\d+$/.test(x.code.slice(p.length)) ? Math.max(m, Number(x.code.slice(p.length))) : m), 0);
  return p + String(max + 1).padStart(4, '0');
};
export const itemErrors = (f, items, id) => {
  const e = {};
  const name = String(f.name || '').trim();
  if (name.length < 2 || name.length > 100) e.name = 'Name must be 2–100 characters';
  const code = String(f.code || '').trim().toLowerCase();
  if (code && items.some((x) => x.id !== id && String(x.code).toLowerCase() === code)) e.code = 'This SKU is already used';
  if (!f.uom) e.uom = 'Unit is required';
  if (Number(f.maxStock) && Number(f.minStock) > Number(f.maxStock)) e.maxStock = 'Max level must be more than safety stock';
  return e;
};

const it = (id, over) => ({ ...blankItem(), id, ...over });
export const SEED_ITEMS = [
  it('i1', { code: 'FG-0001', name: 'MS Square Tube', size: '40x40x2.0 mm', grade: 'YST-210', groupHead: 'gh1', hsn: '7306', rate: 61500, openingStock: 90, minStock: 20, maxStock: 120, location: 'FG Yard A' }),
  it('i2', { code: 'FG-0002', name: 'MS Square Tube', size: '25x25x2.0 mm', grade: 'YST-210', groupHead: 'gh1', hsn: '7306', rate: 61000, openingStock: 50, minStock: 15, maxStock: 80, location: 'FG Yard A' }),
  it('i3', { code: 'FG-0003', name: 'MS Rectangular Tube', size: '60x40x2.5 mm', grade: 'YST-210', groupHead: 'gh1', hsn: '7306', rate: 62000, openingStock: 75, minStock: 20, maxStock: 100, location: 'FG Yard B' }),
  it('i4', { code: 'FG-0004', name: 'MS Rectangular Tube', size: '50x50x2.5 mm', grade: 'YST-210', groupHead: 'gh1', hsn: '7306', rate: 62000, openingStock: 12, minStock: 15, maxStock: 60, location: 'FG Yard B' }),
  it('i5', { code: 'FG-0005', name: 'MS Round Tube', size: '25 NB', grade: 'YST-240', groupHead: 'gh1', hsn: '7306', rate: 60800, openingStock: 65, minStock: 15, maxStock: 90, location: 'FG Yard C' }),
  it('i6', { code: 'FG-0006', name: 'MS Round Tube', size: '32 NB', grade: 'YST-240', groupHead: 'gh1', hsn: '7306', rate: 59500, openingStock: 75, minStock: 15, maxStock: 90, location: 'FG Yard C' }),
  it('i7', { code: 'FG-0007', name: 'MS Round Tube', size: '40 NB', grade: 'YST-240', groupHead: 'gh1', hsn: '7306', rate: 60500, openingStock: 30, minStock: 15, maxStock: 80, location: 'FG Yard C' }),
  it('i8', { code: 'FG-0008', name: 'MS Round Tube', size: '50 NB', grade: 'YST-240', groupHead: 'gh1', hsn: '7306', rate: 61500, openingStock: 20, minStock: 10, maxStock: 60, location: 'FG Yard C' }),
  it('i9', { code: 'RM-0001', name: 'HR Coil', category: 'Raw Material', use: 'purchase', size: '2.5 mm x 1250 mm', grade: 'IS 10748', groupHead: 'gh2', hsn: '7208', rate: 52000, openingStock: 150, moq: 25, minStock: 300, maxStock: 600, vendorIds: ['v1', 'v2'], location: 'RM Bay 1' }),
  it('i10', { code: 'RM-0002', name: 'HR Coil', category: 'Raw Material', use: 'purchase', size: '3.0 mm x 1250 mm', grade: 'IS 10748', groupHead: 'gh2', hsn: '7208', rate: 51500, openingStock: 120, moq: 25, minStock: 300, maxStock: 500, vendorIds: ['v2'], location: 'RM Bay 1' }),
  it('i11', { code: 'CN-0001', name: 'MS Packing Strap', category: 'Consumable / Packing', use: 'purchase', size: '32 mm', groupHead: 'gh3', hsn: '7326', rate: 68000, openingStock: 1.5, moq: 1, minStock: 2, maxStock: 6, vendorIds: ['v3'], location: 'Store' }),
];

// ═══ Stock (Inventory page) ═══
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Does an advice / order line belong to this product? (same name + size; grade too when the product has one) */
export const lineIsItem = (line, item) =>
  norm(line.desc) === norm(item.name) && norm(line.size) === norm(item.size) && (!item.grade || !line.grade || norm(line.grade) === norm(item.grade));
const lineQty = (l) => Number(l.loadQty ?? l.planQty) || 0;
const qtyOf = (advices, item) => advices.reduce((s, a) => s + a.items.filter((l) => lineIsItem(l, item)).reduce((x, l) => x + lineQty(l), 0), 0);
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Stock of one product from the truck movements:
 *  received   = purchase trucks whose GRN is done (material is in our store)
 *  dispatched = sales trucks that have gone out (Gate-Out done)
 *  inStock    = opening qty + received − dispatched
 *  reserved   = sales trucks in process (advice made, not yet out) – already promised
 *  incoming   = purchase trucks on the way / inside, GRN not yet done
 *  available  = inStock − reserved
 * Reorder: when available + incoming falls to the Safety Stock, order up to the Max Level –
 * never less than the MOQ.
 */
export function stockOf(item, advices) {
  const sales = advices.filter((a) => a.type === 'sales');
  const purchase = advices.filter((a) => a.type === 'purchase');
  const received = qtyOf(purchase.filter((a) => a.grn), item);
  const incoming = qtyOf(purchase.filter((a) => !a.grn), item);
  const dispatched = qtyOf(sales.filter((a) => a.stage === 'OUT'), item);
  const reserved = qtyOf(sales.filter((a) => a.stage !== 'OUT'), item);
  const inStock = (Number(item.openingStock) || 0) + received - dispatched;
  const available = inStock - reserved;
  const safety = Number(item.minStock) || 0;
  const max = Number(item.maxStock) || 0;
  const net = available + incoming; // what we will have once the purchase trucks on the way are received
  const low = safety > 0 ? net <= safety : net < 0;
  const buys = item.use !== 'sales';
  const need = Math.max(0, (max || safety) - net);
  const toBuy = buys && low ? r3(Math.max(need, Number(item.moq) || 0)) : 0;
  const status = available <= 0 ? (buys ? 'Purchase needed' : 'Out of stock') : low ? (buys ? 'Purchase needed' : 'Low stock') : 'OK';
  return {
    received: r3(received), incoming: r3(incoming), dispatched: r3(dispatched), reserved: r3(reserved),
    inStock: r3(inStock), available: r3(available), low, toBuy, status,
  };
}

/** Where a master row is still used – checked before delete ("impact check" in the doc). Returns the reasons. */
export function impactOf(kind, row, state) {
  const out = [];
  const add = (list, label) => list.length && out.push(`${list.length} ${label}`);
  if (kind === 'items') {
    add(state.advices.filter((a) => a.items.some((l) => lineIsItem(l, row))), 'advice(s)');
    add((state.orders || []).filter((o) => o.items.some((l) => lineIsItem(l, row))), 'order / indent(s)');
  }
  if (kind === 'vendors') {
    add((state.items || []).filter((x) => x.vendorIds?.includes(row.id)), 'product(s)');
    add((state.orders || []).filter((o) => norm(o.po?.supplier) === norm(row.name) || norm(o.party) === norm(row.name)), 'order / PO(s)');
    add(state.advices.filter((a) => norm(a.party) === norm(row.name)), 'advice(s)');
  }
  if (kind === 'uoms') add((state.items || []).filter((x) => x.uom === row.abbr), 'product(s)');
  if (kind === 'groupHeads') add((state.items || []).filter((x) => x.groupHead === row.id), 'product(s)');
  return out;
}
