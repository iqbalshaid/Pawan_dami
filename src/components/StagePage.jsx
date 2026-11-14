import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { labelsFor } from '../data.js';
import { AdviceSummary, Badge, Empty, Modal, PageHead, Timeline, fmtDT, materialText } from './ui.jsx';

/**
 * Generic queue page. tabs: [{ key, label, stages:[...], filter?, title, Form, readOnly? }]
 * `filter(a)` (optional) narrows a stage-matched tab further, e.g. splitting one stage
 * into "not started yet" / "started, not ended" rows. Form gets { a, sub, done }.
 *
 * Every row has a View button (read-only details + progress). Rows of a pending tab also
 * get an Action button (the step's form); History tabs (readOnly) only have View.
 */
export default function StagePage({ sub, module, title, subtitle, tabs }) {
  const { state, can } = useStore();
  const L = labelsFor(sub);
  const [tabKey, setTabKey] = useState(tabs[0].key);
  const [sel, setSel] = useState(null); // { id, mode: 'view' | 'action' }
  const tab = tabs.find((t) => t.key === tabKey);
  const canAct = can(sub, module, 'action');
  const match = (t, a) => t.stages.includes(a.stage) && (!t.filter || t.filter(a));

  const all = state.advices.filter((a) => a.type === sub);
  const rows = all.filter((a) => match(tab, a));
  const selected = sel && state.advices.find((a) => a.id === sel.id);
  const close = () => setSel(null);

  return (
    <>
      <PageHead title={`${sub === 'sales' ? 'Sales' : 'Purchase'} · ${title}`} sub={subtitle} />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={t.key === tabKey ? 'on' : ''} onClick={() => setTabKey(t.key)}>
            {t.label}
            <i>{all.filter((a) => match(t, a)).length}</i>
          </button>
        ))}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <Empty text="Koi truck nahi hai." />
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Advice</th><th>Truck No.</th><th>{L.party}</th><th>Material</th><th>Route</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.no}</b><div className="muted">{fmtDT(a.date)}</div></td>
                  <td><span className="truck sm">{a.transport.vehicle}</span></td>
                  <td>{a.party}</td>
                  <td className="clip">{materialText(a)}</td>
                  <td>{a.transport.from} ➜ {a.transport.to}</td>
                  <td>{tab.statusOf ? <span className={`badge ${/Delay/.test(tab.statusOf(a)) ? 'red' : 'gray'}`}>{tab.statusOf(a)}</span> : <Badge a={a} />}</td>
                  <td className="acts">
                    <button className="btn sm" onClick={() => setSel({ id: a.id, mode: 'view' })}>View</button>
                    {!tab.readOnly && (
                      <button className="btn primary sm" disabled={!canAct} title={canAct ? '' : 'Is step ka action permission nahi hai'}
                        onClick={() => setSel({ id: a.id, mode: 'action' })}>Action</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <Modal title={`${tab.title || tab.label} – ${selected.no}${sel.mode === 'view' ? ' (View)' : ''}`} wide onClose={close}>
          <AdviceSummary a={selected} />
          {sel.mode === 'view' ? (
            tab.readOnly ? (
              <tab.Form a={selected} sub={sub} done={close} />
            ) : (
              <>
                <h4>Progress</h4>
                <Timeline a={selected} />
              </>
            )
          ) : (
            // stage (not filter) check: after e.g. "Start loading" the truck leaves this filtered
            // list but the same form must stay open and flip to its next view.
            tab.stages.includes(selected.stage) && canAct && (
              <div className="action-box">
                <tab.Form a={selected} sub={sub} done={close} />
              </div>
            )
          )}
        </Modal>
      )}
    </>
  );
}
