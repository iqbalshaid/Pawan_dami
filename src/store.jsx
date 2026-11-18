import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  DEFAULT_TAT, MODULES, SEED_ADVICES, SEED_GROUP_HEADS, SEED_ITEMS, SEED_ORDERS, SEED_PAYMENT_TERMS, SEED_UOMS, SEED_VENDORS, blankItem,
  SEED_USERS, SEED_VERSION, SUBSYSTEMS, issueLegacyGatePasses, labelsFor, modulesFor, normalizeAdvice, userCan } from './data.js';

// Next running number for a Sales Order (SO/26/141) or Indent (IND/26/004) – one series per prefix + year.
const nextOrderNo = (orders, type) => {
  const prefix = `${type === 'purchase' ? 'IND' : 'SO'}/${String(new Date().getFullYear()).slice(-2)}/`;
  const max = orders.filter((o) => o.no.startsWith(prefix)).reduce((m, o) => Math.max(m, Number(o.no.slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(3, '0');
};

// Advices created in the app get id 'a' + Date.now(); everything else is demo data.
const isUserCreated = (a) => /^a\d{13}$/.test(a.id);

const KEY = 'pp_erp_ui_v1';

// Sales & Purchase masters kept in state (products, customers / suppliers, payment terms, UOM, product group heads).
const MASTER_SEEDS = { items: SEED_ITEMS, uoms: SEED_UOMS, vendors: SEED_VENDORS, paymentTerms: SEED_PAYMENT_TERMS, groupHeads: SEED_GROUP_HEADS };
// Bump when the demo master rows change; rows the user added (id = prefix + Date.now()) are kept.
const MASTER_VERSION = 2;
const isUserRow = (x) => /\d{13}$/.test(x.id);
const Ctx = createContext(null);

const allPermKeys = () => {
  const keys = [];
  SUBSYSTEMS.forEach((s) => modulesFor(s.key).forEach((m) => keys.push(`${s.key}.${m.key}`)));
  return keys;
};

/**
 * Migrate a saved snapshot so new modules (added after the user's data was saved)
 * show up without needing a manual reset. Admin always gets full access to every
 * current module. New seed users (e.g. a later-added Accounts role) are added in.
 * Existing users keep whatever permissions they already have on old module keys.
 */
const migrate = (saved) => {
  const keys = allPermKeys();
  const byId = new Map(saved.users.map((u) => [u.id, u]));
  SEED_USERS.forEach((seedUser) => {
    if (!byId.has(seedUser.id)) byId.set(seedUser.id, seedUser); // bring in users added later
  });
  const users = [...byId.values()].map((u) => {
    const perms = { ...u.perms };
    keys.forEach((k) => {
      // A page added after this user was saved: admin gets everything, others their default (seed) access.
      if (!perms[k]) perms[k] = u.role === 'admin' ? MODULES.find((m) => k.endsWith('.' + m.key)).actions.slice() : (SEED_USERS.find((x) => x.id === u.id)?.perms?.[k] || []).slice();
    });
    return { ...u, perms };
  });
  // New demo set? Swap in the fresh demo trucks but keep advices the user created.
  const advices = saved.seedVersion === SEED_VERSION
    ? saved.advices
    : [...saved.advices.filter(isUserCreated), ...SEED_ADVICES];
  // Saves from before Sales Order / Indent existed get the demo orders.
  const orders = saved.orders || SEED_ORDERS;
  const settings = { ...saved.settings, tat: { ...DEFAULT_TAT, ...(saved.settings?.tat || {}) } };
  // Masters: missing ones get the demo rows; a new demo set replaces old demo rows but keeps the user's own.
  const masters = Object.fromEntries(Object.entries(MASTER_SEEDS).map(([k, seed]) => [
    k, !saved[k] ? seed : saved.masterVersion === MASTER_VERSION ? saved[k] : [...saved[k].filter(isUserRow), ...seed],
  ]));
  // Products saved before newer fields existed; only Sales / Purchase now ("Both" → Sales).
  masters.items = masters.items.map((x) => ({ ...blankItem(), ...x, use: x.use === 'purchase' ? 'purchase' : 'sales' }));
  // Parties are only Customers (Sales) or Suppliers (Purchase); older Store / Service / Transport / Other → Supplier.
  masters.vendors = masters.vendors.map((v) => ({ ...v, type: v.type === 'Sales' ? 'Sales' : 'Purchase' }));
  delete saved.boms; // BOM (production) is no longer part of the Sales / Purchase master
  return { ...saved, users, settings, ...masters, masterVersion: MASTER_VERSION, advices: issueLegacyGatePasses(advices.map(normalizeAdvice)), orders, seedVersion: SEED_VERSION };
};

const fresh = () => ({ users: SEED_USERS, advices: SEED_ADVICES, orders: SEED_ORDERS, ...MASTER_SEEDS, masterVersion: MASTER_VERSION, settings: { tat: DEFAULT_TAT }, currentUserId: 'u1', seedVersion: SEED_VERSION });

const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {}
  return fresh();
};

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const user = state.users.find((u) => u.id === state.currentUserId) || state.users[0];

  const can = useCallback(
    (sub, module, action = 'view') => userCan(state.users, user, `${sub}.${module}`, action),
    [user, state.users]
  );
  const canAny = useCallback((sub) => Object.keys(user?.perms || {}).some((k) => k.startsWith(sub + '.') && user.perms[k].length), [user]);

  const api = useMemo(
    () => ({
      state,
      user,
      can,
      canAny,
      setCurrentUser: (id) => setState((s) => ({ ...s, currentUserId: id })),
      togglePerm: (userId, key, action, on) =>
        setState((s) => ({
          ...s,
          users: s.users.map((u) => {
            if (u.id !== userId) return u;
            let list = new Set(u.perms[key] || []);
            on ? list.add(action) : list.delete(action);
            // action/create implies view
            if (on && action !== 'view') list.add('view');
            if (!on && action === 'view') list = new Set();
            return { ...u, perms: { ...u.perms, [key]: [...list] } };
          }),
        })),
      // Alternative Users: every id in `altIds` can cover `userId` on page `key` (empty = none)
      setAlt: (userId, key, altIds) =>
        setState((s) => ({
          ...s,
          users: s.users.map((u) => {
            if (u.id !== userId) return u;
            const alt = { ...(u.alt || {}) };
            if (altIds.length) alt[key] = altIds;
            else delete alt[key];
            return { ...u, alt };
          }),
        })),
      setAllPerms: (userId, keys, on) =>
        setState((s) => ({
          ...s,
          users: s.users.map((u) => {
            if (u.id !== userId) return u;
            const perms = { ...u.perms };
            keys.forEach(({ key, actions }) => (perms[key] = on ? actions.slice() : []));
            return { ...u, perms };
          }),
        })),
      createAdvice: (type, data) => {
        let created;
        setState((s) => {
          const L = labelsFor(type);
          const n = s.advices.filter((a) => a.type === type).length + 1;
          const no = `${L.prefix}-${String(n).padStart(4, '0')}`;
          created = { ...data, id: 'a' + Date.now(), type, no, stage: 'CREATED', date: new Date().toISOString() };
          return { ...s, advices: [created, ...s.advices] };
        });
        return created;
      },
      // Sales Order (type 'sales') or Purchase Indent (type 'purchase'); number is assigned here.
      createOrder: (type, data) =>
        setState((s) => ({
          ...s,
          orders: [{ ...data, id: 'o' + Date.now(), type, no: nextOrderNo(s.orders, type) }, ...s.orders],
        })),
      // Many orders at once (CSV import): one running number each, ids kept unique within the same millisecond.
      createOrders: (type, list) =>
        setState((s) => {
          let orders = s.orders;
          list.forEach((data, i) => {
            orders = [{ ...data, id: 'o' + (Date.now() + i), type, no: nextOrderNo(orders, type) }, ...orders];
          });
          return { ...s, orders };
        }),
      updateOrder: (id, patch) =>
        setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      updateAdvice: (id, patch) =>
        setState((s) => ({ ...s, advices: s.advices.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      // Masters (key = 'items' | 'uoms' | 'vendors' | 'paymentTerms' | 'groupHeads' | 'boms').
      // addRows takes a list so a CSV import lands in one go; ids are prefix + Date.now() + index.
      addRows: (key, rows) =>
        setState((s) => ({ ...s, [key]: [...(s[key] || []), ...rows.map((r, i) => ({ ...r, id: key.slice(0, 2) + (Date.now() + i) }))] })),
      updateRow: (key, id, patch) => setState((s) => ({ ...s, [key]: s[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteRow: (key, id) => setState((s) => ({ ...s, [key]: s[key].filter((x) => x.id !== id) })),
      // Master → TAT Settings: patch one subsystem's TAT, e.g. setTat('sales', { exitMin: 60 })
      setTat: (sub, patch) =>
        setState((s) => ({ ...s, settings: { ...s.settings, tat: { ...s.settings?.tat, [sub]: { ...s.settings?.tat?.[sub], ...patch } } } })),
      resetDemo: () => {
        localStorage.removeItem(KEY);
        setState(fresh());
      },
    }),
    [state, user, can, canAny]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
