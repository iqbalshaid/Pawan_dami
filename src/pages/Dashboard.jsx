import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { STAGES, SUBSYSTEMS, actOf, moduleAt, slugOf, stageLabel, stagesFor } from '../data.js';
import { Badge, Empty, fmtDT, plannedTotal } from '../components/ui.jsx';

const ACTION_TEXT = (a) => ({
  CREATED: 'Security check karke gate-in karna hai', GATED_IN: '1st weight lena hai', TARE_DONE: `${actOf(a)} karni hai`,
  LOADED: 'Final weight lena hai',
  FINAL_DONE: a.type === 'purchase' ? 'Material receipt (GRN) karna hai' : 'Billing & tax invoice banana hai',
  BILLED: 'Documents verify karne hain', DOC_OK: 'Gate pass generate karna hai',
  GATEPASS: 'Security clearance dena hai',
  CLEARED: a.type === 'purchase' ? 'Khaali gaadi gate-out karni hai' : 'Gate-out record karna hai',
}[a.stage]);
const INSIDE = ['GATED_IN', 'TARE_DONE', 'LOADED', 'FINAL_DONE', 'BILLED', 'DOC_OK', 'GATEPASS', 'CLEARED'];

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const KPI_ICON = {
  total: '🚚', wait: '🚦', inside: '🏭', done: '✅', qty: '⚖️',
};

function Kpi({ icon, label, value, unit, note, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <span className="kpi-ic">{icon}</span>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <b>{value}{unit && <small>{unit}</small>}</b>
        {note && <em>{note}</em>}
      </div>
    </div>
  );
}

const STATUS_COLORS = { wait: '#64748b', inside: '#b45309', done: '#15803d' };

function Donut({ parts, total, centerLabel }) {
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line, #e2e8f0)" strokeWidth="18" />
      {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
        const len = (p.value / total) * C;
        const el = (
          <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18"
            strokeDasharray={`${Math.max(len - 2, 0.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)">
            <title>{`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}</title>
          </circle>
        );
        off += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" className="donut-n">{total}</text>
      <text x="70" y="86" textAnchor="middle" className="donut-l">{centerLabel}</text>
    </svg>
  );
}

function Legend({ items }) {
  return (
    <ul className="legend">
      {items.map((p) => (
        <li key={p.label}><i style={{ background: p.color }} />{p.label}<b>{p.value}</b></li>
      ))}
    </ul>
  );
}

function Charts({ adv, visibleSubs }) {
  const waiting = adv.filter((a) => a.stage === 'CREATED').length;
  const done = adv.filter((a) => a.stage === 'OUT').length;
  const inside = adv.length - waiting - done;
  const parts = [
    { label: 'Gate-In ka wait', value: waiting, color: STATUS_COLORS.wait },
    { label: 'Plant ke andar', value: inside, color: STATUS_COLORS.inside },
    { label: 'Complete (gate-out)', value: done, color: STATUS_COLORS.done },
  ];

  // delay: trucks whose loading/unloading has ended
  const ended = adv.filter((a) => a.loading?.end);
  const late = ended.filter((a) => a.loading.delayMin > 0);
  const onTime = ended.length - late.length;
  const avgDelay = late.length ? Math.round(late.reduce((s, a) => s + a.loading.delayMin, 0) / late.length) : 0;
  const pctOn = ended.length ? Math.round((onTime / ended.length) * 100) : 0;

  return (
    <div className="chart-cols">
      <div className="card">
        <div className="card-title"><h3>Truck status</h3><span className="muted">{adv.length} trucks</span></div>
        {adv.length === 0 ? <Empty text="Abhi koi truck nahi." /> : (
          <div className="donut-wrap">
            <Donut parts={parts} total={adv.length} centerLabel="trucks" />
            <Legend items={parts.map((p) => ({ ...p, value: `${p.value} · ${Math.round((p.value / adv.length) * 100)}%` }))} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><h3>Sales vs Purchase</h3><span className="muted">status ke hisaab se</span></div>
        {visibleSubs.length === 0 ? <Empty text="Koi data nahi." /> : (
          <>
            <div className="hbars">
              {visibleSubs.map((s) => {
                const l = adv.filter((a) => a.type === s.key);
                const seg = [
                  [l.filter((a) => a.stage === 'CREATED').length, STATUS_COLORS.wait, 'Gate-In ka wait'],
                  [l.filter((a) => a.stage !== 'CREATED' && a.stage !== 'OUT').length, STATUS_COLORS.inside, 'Plant ke andar'],
                  [l.filter((a) => a.stage === 'OUT').length, STATUS_COLORS.done, 'Complete'],
                ];
                return (
                  <div key={s.key} className="hbar">
                    <span className="hb-name">{s.label}</span>
                    <div className="hb-track">
                      {seg.filter(([n]) => n > 0).map(([n, c, t]) => (
                        <i key={t} style={{ flex: n, background: c }} title={`${s.label} · ${t}: ${n}`}>{n}</i>
                      ))}
                    </div>
                    <b>{l.length}</b>
                  </div>
                );
              })}
            </div>
            <Legend items={parts.map((p) => ({ ...p, value: '' }))} />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title"><h3>Loading / Unloading time</h3><span className="muted">{ended.length} complete</span></div>
        {ended.length === 0 ? <Empty text="Abhi koi loading/unloading complete nahi hui." /> : (
          <>
            <div className="big-num"><b>{pctOn}%</b><span>trucks time par complete hue</span></div>
            <div className="hb-track tall">
              {onTime > 0 && <i style={{ flex: onTime, background: STATUS_COLORS.done }} title={`Time par: ${onTime}`}>{onTime}</i>}
              {late.length > 0 && <i style={{ flex: late.length, background: '#b91c1c' }} title={`Delay: ${late.length}`}>{late.length}</i>}
            </div>
            <Legend items={[
              { label: 'Time par', value: onTime, color: STATUS_COLORS.done },
              { label: 'Delay hua', value: late.length, color: '#b91c1c' },
            ]} />
            {late.length > 0 && <p className="muted" style={{ marginTop: 8 }}>Delay wale trucks me average delay: <b>{avgDelay} min</b></p>}
          </>
        )}
      </div>
    </div>
  );
}

function Pipeline({ sub, list, can, canSee }) {
  const entries = stagesFor(sub.key).filter((k) => canSee(sub.key, k)).map((k) => [k, STAGES[k]]);
  const max = Math.max(1, ...entries.map(([k]) => list.filter((a) => a.stage === k).length));
  return (
    <div className="card">
      <div className="card-title">
        <h3><span className={`dot-icon ${sub.key}`} /> {sub.label} pipeline</h3>
        <span className="muted">{list.length} trucks</span>
      </div>
      <div className="pipe">
        {entries.map(([k, v], i) => {
          const n = list.filter((a) => a.stage === k).length;
          const mod = moduleAt(k, sub.key);
          const label = stageLabel(k, sub.key);
          const body = (
            <>
              <span className="pstep">{i + 1}</span>
              <span className="pl">{label}</span>
              <span className="pbar"><i className={`tone-${v.tone}`} style={{ width: n ? `${Math.max((n / max) * 100, 6)}%` : '0%' }} /></span>
              <b className={n ? '' : 'muted'}>{n}</b>
            </>
          );
          return mod && can(sub.key, mod, 'view') ? (
            <Link key={k} className="prow link" to={`/${sub.key}/${slugOf(sub.key, mod)}`} title={`${label}: ${n} truck`}>{body}</Link>
          ) : (
            <div key={k} className="prow" title={`${label}: ${n} truck`}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { state, user, can } = useStore();
  // The dashboard only shows what this user has access to: a truck is visible if they can open
  // the page that handles it at its current stage (released trucks → Gate-Out page), or they can
  // see that subsystem's Advice list (which lists every truck).
  const canSee = (sub, stage) => {
    if (can(sub, 'inventory', 'view')) return true;
    const m = stage === 'OUT' ? 'gateout' : moduleAt(stage, sub);
    return !!m && can(sub, m, 'view');
  };
  const adv = state.advices.filter((a) => canSee(a.type, a.stage));
  const visibleSubs = SUBSYSTEMS.filter((s) => stagesFor(s.key).some((k) => canSee(s.key, k)));
  const inside = adv.filter((a) => INSIDE.includes(a.stage));
  const done = adv.filter((a) => a.stage === 'OUT');
  const waiting = adv.filter((a) => a.stage === 'CREATED');
  const inProcessMT = adv.filter((a) => a.stage !== 'OUT').reduce((s, a) => s + plannedTotal(a), 0);

  // my pending work, based on action permission
  const mine = adv.filter((a) => moduleAt(a.stage, a.type) && can(a.type, moduleAt(a.stage, a.type), 'action'));

  // recent activity from timestamps
  const events = [];
  adv.forEach((a) => {
    const add = (t, text, by) => t && events.push({ t, text, by, a });
    add(a.date, 'Advice create hui', '');
    add(a.gateIn?.time, 'Gate-In hua', a.gateIn?.by);
    add(a.tare?.time, '1st weight liya', a.tare?.by);
    add(a.loading?.end, `${actOf(a)} complete`, a.loading?.endBy || a.loading?.by);
    add(a.final?.time, 'Final weight liya', a.final?.by);
    add(a.billing?.time, `Billing done · Invoice ${a.billing?.invoiceNo}`, a.billing?.by);
    add(a.dispatch?.time, `Dispatch OK · ${a.dispatch?.gatePassNo}`, a.dispatch?.by);
    add(a.grn?.time, `GRN · ${a.grn?.grnNo}`, a.grn?.by);
    add(a.gateOut?.time, 'Gate-Out hua', a.gateOut?.by);
  });
  events.sort((x, y) => new Date(y.t) - new Date(x.t));

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="hello">
        <div>
          <h1>{greet}, {user.name.split(' ')[0]}</h1>
          <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · aapke access ke hisaab se plant ka status</p>
        </div>
      </div>

      {visibleSubs.length === 0 && (
        <div className="alert">Abhi aapko kisi subsystem (Sales / Purchase) ka access nahi mila hai. Admin se Master → Permissions me access maangein.</div>
      )}

      <div className="kpis">
        <Kpi icon={KPI_ICON.total} label="Total trucks" value={adv.length} note={visibleSubs.map((s) => `${adv.filter((a) => a.type === s.key).length} ${s.label.toLowerCase()}`).join(' · ') || '—'} />
        <Kpi icon={KPI_ICON.wait} label="Gate-In ka wait" value={waiting.length} note="advice bani, truck aana baaki" tone="gray" />
        <Kpi icon={KPI_ICON.inside} label="Abhi plant ke andar" value={inside.length} note="gate-in ho chuke, gate-out baaki" tone="amber" />
        <Kpi icon={KPI_ICON.done} label="Dispatch complete" value={done.length} note="gate-out ho gaya" tone="green" />
        <Kpi icon={KPI_ICON.qty} label="In process qty" value={inProcessMT} unit=" MT" note="planned, abhi tak bahar nahi gaya" tone="blue" />
      </div>

      {adv.length > 0 && <Charts adv={adv} visibleSubs={visibleSubs} />}

      <div className="dash-cols">
        <div className="card">
          <div className="card-title">
            <h3>Mera pending kaam</h3>
            <span className={`pill ${mine.length ? 'hot' : ''}`}>{mine.length}</span>
          </div>
          {mine.length === 0 ? (
            <Empty text="Aapke liye koi pending kaam nahi hai." />
          ) : (
            <ul className="work">
              {mine.map((a) => (
                <li key={a.id}>
                  <i className={`stripe tone-${STAGES[a.stage].tone}`} />
                  <span className="truck sm">{a.transport.vehicle}</span>
                  <div>
                    <b>{ACTION_TEXT(a)}</b>
                    <div className="muted">{a.no} · {a.party} · {a.type === 'sales' ? 'Sales' : 'Purchase'}</div>
                  </div>
                  <Link className="btn primary sm" to={`/${a.type}/${slugOf(a.type, moduleAt(a.stage, a.type))}`}>Open</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-title"><h3>Recent activity</h3></div>
          {events.length === 0 ? <Empty text="Abhi koi activity nahi." /> : (
            <ul className="feed">
              {events.slice(0, 8).map((e, i) => (
                <li key={i}>
                  <i className={`fd ${e.a.type}`} title={e.a.type === 'sales' ? 'Sales' : 'Purchase'} />
                  <div>
                    <b>{e.text}</b> <span className="truck sm">{e.a.transport.vehicle}</span>
                    <div className="muted">{e.a.no} · {fmtDT(e.t)}{e.by ? ` · ${e.by}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="dash-cols">
        {visibleSubs.map((s) => (
          <Pipeline key={s.key} sub={s} list={adv.filter((a) => a.type === s.key)} can={can} canSee={canSee} />
        ))}
      </div>

      <div className="card">
        <div className="card-title"><h3>Plant ke andar ke trucks</h3><span className="muted">{inside.length} trucks</span></div>
        {inside.length === 0 ? <Empty text="Abhi plant me koi truck nahi hai." /> : (
          <table className="tbl">
            <thead><tr><th>Truck</th><th>Advice</th><th>Party</th><th>Route</th><th>Status</th><th>Andar kab se</th></tr></thead>
            <tbody>
              {inside.map((a) => (
                <tr key={a.id} className={`tone-row-${STAGES[a.stage].tone}`}>
                  <td><span className="truck sm">{a.transport.vehicle}</span></td>
                  <td><b>{a.no}</b></td>
                  <td>{a.party}</td>
                  <td>{a.transport.from} ➜ {a.transport.to}</td>
                  <td><Badge a={a} /></td>
                  <td>{a.gateIn ? ago(a.gateIn.time) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
