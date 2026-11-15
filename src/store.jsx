import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { MODULES, SEED_ADVICES, SEED_USERS, SEED_VERSION, SUBSYSTEMS, labelsFor, modulesFor, normalizeAdvice, userCan } from './data.js';

// Advices created in the app get id 'a' + Date.now(); everything else is demo data.
const isUserCreated = (a) => /^a\d{13}$/.test(a.id);

const KEY = 'pp_erp_ui_v1';
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
  const { orders: _legacyOrders, ...rest } = saved; // Sales Order / Indent were removed – drop old saved copies
  return { ...rest, users, advices: advices.map(normalizeAdvice), seedVersion: SEED_VERSION };
};

const fresh = () => ({ users: SEED_USERS, advices: SEED_ADVICES, currentUserId: 'u1', seedVersion: SEED_VERSION });

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
      updateAdvice: (id, patch) =>
        setState((s) => ({ ...s, advices: s.advices.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
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
