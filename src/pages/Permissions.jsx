import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { ROLES, SUBSYSTEMS, altsOf, modulesFor, nameOf } from '../data.js';
import { PageHead } from '../components/ui.jsx';

const SUB_ICON = { sales: '📤', purchase: '📥' };

/** Multi-select of alternative users – a button showing the choice that opens a checklist inline. */
function AltPicker({ value, options, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const names = options.filter((o) => value.includes(o.id)).map((o) => o.name.split(' (')[0]);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="alt-pick">
      <button type="button" className={`alt-btn ${names.length ? 'has' : ''}`} disabled={disabled} onClick={() => setOpen(!open)}>
        <span>{names.length ? names.join(', ') : '— None —'}</span>
        <i>{open ? '▴' : '▾'}</i>
      </button>
      {open && !disabled && (
        <div className="alt-list">
          {options.map((o) => (
            <label key={o.id}>
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} /> {o.name}
            </label>
          ))}
          {value.length > 0 && <button type="button" className="btn sm ghost" onClick={() => onChange([])}>Sab hatao</button>}
        </div>
      )}
    </div>
  );
}

// What the user can do on a page, as a small pill.
const levelOf = (perms) => {
  if (!perms?.includes('view')) return 'None';
  if (perms.includes('action')) return 'Action';
  if (perms.includes('create')) return 'Create';
  return 'View';
};

export default function Permissions() {
  const { state, togglePerm, setAllPerms, setAlt, user, resetDemo } = useStore();
  const { uid } = useParams(); // which user is being edited – picked from the dropdown on this page
  const navigate = useNavigate();
  const [open, setOpen] = useState({ sales: true });
  const target = state.users.find((u) => u.id === uid) || state.users.find((u) => u.role !== 'admin') || state.users[0];
  const others = state.users.filter((u) => u.id !== target.id && u.role !== 'admin');

  if (user.role !== 'admin') return <div className="alert">Sirf Admin permission page dekh sakta hai.</div>;

  return (
    <>
      <PageHead
        title={`Master · Permissions – ${target.name}`}
        sub={`${ROLES[target.role]}. Sales / Purchase me jo pages dene hain unka View / Action tick karo – baaki pages is user ke sidebar me dikhenge hi nahi. Alternative users = jab ye user na ho to wo (ek ya zyada) is page ka kaam kar sakte hain.`}
        right={
          <button className="btn" onClick={() => confirm('Saari settings (users ki permissions aur demo data) default par sync karein? Aapke banaye hue advices bhi hat jayenge.') && resetDemo()}>
            Sync setting
          </button>
        }
      />
      <div className="card perm-user">
        <label className="field">
          <span>User chuno</span>
          <select value={target.id} onChange={(e) => navigate(`/master/permissions/${e.target.value}`)}>
            {state.users.filter((u) => u.role !== 'admin').map((u) => (
              <option key={u.id} value={u.id}>{u.name} – {ROLES[u.role]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="perm-layout">
        <div className="perm-main">
          {SUBSYSTEMS.map((s) => {
            const mods = modulesFor(s.key);
            const keys = mods.map((m) => ({ key: `${s.key}.${m.key}`, actions: m.actions }));
            const seen = mods.filter((m) => target.perms[`${s.key}.${m.key}`]?.includes('view')).length;
            const full = keys.every(({ key, actions }) => actions.every((a) => target.perms[key]?.includes(a)));
            const [statusText, statusCls] = seen === 0 ? ['No Access', 'none'] : full ? ['Full Access', 'full'] : ['Partial Access', 'partial'];
            const isOpen = !!open[s.key];
            return (
              <div className="card pcard" key={s.key}>
                <div className="pcard-head" onClick={() => setOpen({ ...open, [s.key]: !isOpen })}>
                  <svg className={isOpen ? '' : 'closed'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="pcard-ic">{SUB_ICON[s.key]}</span>
                  <div className="pcard-t">
                    <b>{s.label}</b>
                    <span>{seen} of {mods.length} pages visible</span>
                  </div>
                  <span className={`pstatus ${statusCls}`}>{statusText}</span>
                  <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); setAllPerms(target.id, keys, false); }}>Revoke</button>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAllPerms(target.id, keys, true); }}>Grant</button>
                </div>

                {isOpen && (
                  <table className="tbl perm-tbl">
                    <thead>
                      <tr>
                        <th>Page</th>
                        <th className="c">View</th>
                        <th className="c">Create</th>
                        <th className="c">Action</th>
                        <th>Alternative user</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mods.map((m) => {
                        const key = `${s.key}.${m.key}`;
                        const perms = target.perms[key] || [];
                        const lvl = levelOf(perms);
                        return (
                          <tr key={m.key}>
                            <td>
                              {nameOf(s.key, m.key)}
                              <span className={`lvl ${lvl.toLowerCase()}`}>{lvl}</span>
                            </td>
                            {['view', 'create', 'action'].map((a) => (
                              <td key={a} className="c">
                                {m.actions.includes(a) ? (
                                  <input type="checkbox" checked={perms.includes(a)} onChange={(e) => togglePerm(target.id, key, a, e.target.checked)} />
                                ) : <span className="muted">–</span>}
                              </td>
                            ))}
                            <td>
                              <AltPicker value={altsOf(target, key)} options={others} disabled={lvl === 'None'} onChange={(ids) => setAlt(target.id, key, ids)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
