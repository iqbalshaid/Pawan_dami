import React, { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useStore } from './store.jsx';
import { MODULES, ROLES, SUBSYSTEMS, moduleOfSlug, nameOf, pendingCount, slugOf } from './data.js';
import Dashboard from './pages/Dashboard.jsx';
import { InventoryPage } from './pages/Inventory.jsx';
import { BiltyPage } from './pages/Documents.jsx';
import {
  BillingPage, ClearancePage, DocVerifyPage, FinalWeighmentPage, GateOutPage,
  GatePassPage, GrnPage, LoadingPage, VerificationPage, WeighmentPage,
} from './pages/Stages.jsx';
import Permissions from './pages/Permissions.jsx';
import { IndentApprovalPage, IndentPage, OrderApprovalPage, OrderPage, PoPage } from './pages/Orders.jsx';

const PAGES = {
  order: OrderPage, orderapproval: OrderApprovalPage, indent: IndentPage, indentapproval: IndentApprovalPage, po: PoPage, inventory: InventoryPage, gatein: VerificationPage, weighin: WeighmentPage, loading: LoadingPage,
  weighout: FinalWeighmentPage, billing: BillingPage, docverify: DocVerifyPage, gatepass: GatePassPage,
  clearance: ClearancePage, grn: GrnPage, gateout: GateOutPage, bilty: BiltyPage,
};

// Sales: our bilty is generated with the Gate Pass, so its page sits right after it.
// Purchase: no bilty page – the supplier's LR no. + photo are recorded at Gate-In.
const ORDER = {
  sales: ['order', 'orderapproval', 'inventory', 'gatein', 'weighin', 'loading', 'weighout', 'billing', 'docverify', 'gatepass', 'bilty', 'clearance', 'gateout'],
  purchase: ['indent', 'indentapproval', 'po', 'inventory', 'gatein', 'weighin', 'loading', 'weighout', 'grn', 'gateout'],
};
// Pages folded under one collapsible heading inside a subsystem (down arrow opens them).
const SUB_GROUPS = {
  sales: [{ title: 'Order', keys: ['order', 'orderapproval'] }],
  purchase: [{ title: 'Indent & PO', keys: ['indent', 'indentapproval', 'po'] }],
};

function ModuleRoute() {
  const { sub, module: slug } = useParams();
  const { can } = useStore();
  const module = SUBSYSTEMS.some((s) => s.key === sub) ? moduleOfSlug(sub, slug) : null;
  const Page = module && PAGES[module];
  if (!Page) return <Navigate to="/" replace />;
  if (!can(sub, module, 'view')) return <div className="alert">Aapke paas is page ka access nahi hai. Admin se Master → Permissions me access maangein.</div>;
  return <Page sub={sub} />;
}

// `paths` (optional) = the links inside; the group starts open when one of them is the current page.
function Group({ title, id, count, children, paths, nested }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(paths ? paths.includes(pathname) : pathname.startsWith('/' + id + '/'));
  return (
    <div className={`grp${nested ? ' sub' : ''}`}>
      <button className="grp-t" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}{count > 0 && <b className="nav-count">{count}</b>}</span>
        <svg className={open ? 'open' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="grp-body">{children}</div>}
    </div>
  );
}

export default function App() {
  const { state, user, can, setCurrentUser } = useStore();
  const [menu, setMenu] = useState(false); // phone/tablet: sidebar is a slide-in drawer
  const { pathname } = useLocation();
  React.useEffect(() => setMenu(false), [pathname]);
  return (
    <div className="layout">
      <header className="topbar">
        <button className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>☰</button>
        <b>Pawan Putra Tubes</b>
      </header>
      {menu && <div className="side-backdrop" onClick={() => setMenu(false)} />}
      <aside className={`side${menu ? ' open' : ''}`}>
        <div className="brand"><b>Pawan Putra Tubes</b><span>Dispatch System</span></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          {SUBSYSTEMS.map((s) => {
            const order = ORDER[s.key];
            const mods = order.map((k) => MODULES.find((m) => m.key === k)).filter((m) => can(s.key, m.key, 'view'));
            if (!mods.length) return null;
            // Approval / PO badges = indents waiting at that step; truck pages count trucks.
            const count = (m) => {
              const st = { orderapproval: 'pending', indentapproval: 'pending', po: 'approved' }[m.key];
              if (st) return state.orders.filter((o) => o.type === s.key && o.status === st).length;
              return ['order', 'indent'].includes(m.key) ? 0 : pendingCount(state.advices, s.key, m.key);
            };
            const counts = Object.fromEntries(mods.map((m) => [m.key, count(m)]));
            const total = Object.values(counts).reduce((x, y) => x + y, 0);
            const link = (m) => (
              <NavLink key={m.key} to={`/${s.key}/${slugOf(s.key, m.key)}`}>
                <span>{nameOf(s.key, m.key)}</span>
                {counts[m.key] > 0 && <b className="nav-count" title="Pending">{counts[m.key]}</b>}
              </NavLink>
            );
            const groups = SUB_GROUPS[s.key] || [];
            const groupOf = (k) => groups.find((g) => g.keys.includes(k));
            return (
              <Group key={s.key} title={s.label} id={s.key} count={total}>
                {mods.map((m) => {
                  const g = groupOf(m.key);
                  if (!g) return link(m);
                  const inner = mods.filter((x) => g.keys.includes(x.key));
                  if (inner[0] !== m) return null; // whole group is drawn at its first visible page
                  return (
                    <Group key={g.title} nested title={g.title}
                      count={inner.reduce((n, x) => n + counts[x.key], 0)}
                      paths={inner.map((x) => `/${s.key}/${slugOf(s.key, x.key)}`)}>
                      {inner.map(link)}
                    </Group>
                  );
                })}
              </Group>
            );
          })}
          {user.role === 'admin' && (
            <Group title="Master" id="master">
              <NavLink to="/master/permissions">Permissions</NavLink>
            </Group>
          )}
        </nav>
        <div className="who">
          <small>Logged in as (demo)</small>
          <select value={user.id} onChange={(e) => setCurrentUser(e.target.value)}>
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.name} – {ROLES[u.role]}</option>)}
          </select>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/master/permissions" element={<Permissions />} />
          <Route path="/master/permissions/:uid" element={<Permissions />} />
          <Route path="/:sub/:module" element={<ModuleRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
