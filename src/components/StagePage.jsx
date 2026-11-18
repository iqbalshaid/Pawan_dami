import React, { useState } from 'react';
import Ico from './Icon.jsx';
import { useStore } from '../store.jsx';
import { labelsFor } from '../data.js';
import { AdviceSummary, Badge, Empty, Modal, PageHead, Timeline, fmtDT, materialText, statusText } from './ui.jsx';
import { ExportButtons } from './DataIO.jsx';

/**
 * Generic queue page. tabs: [{ key, label, stages:[...], filter?, title, Form, readOnly?, cols? }]
 * `cols` (optional) = extra named columns shown after Status, e.g. a "Delay" column:
 *   [{ label: 'Delay', value: (a) => '30 min', danger?: (a) => true }] – danger shows the cell in red.
 * `filter(a)` (optional) narrows a stage-matched tab further, e.g. splitting one stage
 * into "not started yet" / "started, not ended" rows. Form gets { a, sub, done }.
 *
 * Every row has a View button (read-only details + progress). Rows of a pending tab also
 * get an Action button (the step's form); History tabs (readOnly) only have View – plus an
 * Edit button when the tab has `Edit` (a form taking { a, sub, done, edit }) and
 * `editable(a)` says the record can still be corrected (the next step has not acted on it).
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
      <PageHead
        title={`${sub === 'sales' ? 'Sales' : 'Purchase'} · ${title}`} sub={subtitle}
        right={
          // CSV / PDF of the trucks in the open tab, with the same columns as the table.
          <ExportButtons
            title={`${sub === 'sales' ? 'Sales' : 'Purchase'} ${title} – ${tab.label}`}
            filename={`${sub}-${module}-${tab.key}`}
            rows={rows}
            columns={[
              ['Advice', (a) => a.no], ['Date', (a) => fmtDT(a.date)], ['Truck No.', (a) => a.transport.vehicle], [L.party, (a) => a.party],
              ['Material', materialText], ['Route', (a) => `${a.transport.from} -> ${a.transport.to}`], ['Status', statusText],
              ...(tab.cols || []).map((c) => [c.label, c.value]),
            ]}
          />
        }
      />
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
          <Empty text="No trucks." />
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Advice</th><th>Truck No.</th><th>{L.party}</th><th>Material</th><th>Route</th><th>Status</th>{(tab.cols || []).map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.no}</b><div className="muted">{fmtDT(a.date)}</div></td>
                  <td><span className="truck sm">{a.transport.vehicle}</span></td>
                  <td>{a.party}</td>
                  <td className="clip">{materialText(a)}</td>
                  <td>{a.transport.from} ➜ {a.transport.to}</td>
                  <td><Badge a={a} /></td>
                  {(tab.cols || []).map((c) => (
                    <td key={c.label}>{c.danger?.(a) ? <span className="badge red">{c.value(a)}</span> : c.value(a)}</td>
                  ))}
                  <td className="acts">
                    <button className="btn sm" onClick={() => setSel({ id: a.id, mode: 'view' })}><Ico name="view" />View</button>
                    {tab.readOnly && tab.Edit && tab.editable?.(a) && canAct && (
                      <button className="btn sm" onClick={() => setSel({ id: a.id, mode: 'edit' })}><Ico name="edit" />Edit</button>
                    )}
                    {!tab.readOnly && (
                      <button className="btn primary sm" disabled={!canAct} title={canAct ? '' : 'You do not have permission for this step'}
                        onClick={() => setSel({ id: a.id, mode: 'action' })}><Ico name="action" />Action</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <Modal title={`${tab.title || tab.label} – ${selected.no}${sel.mode === 'view' ? ' (View)' : sel.mode === 'edit' ? ' (Edit)' : ''}`} wide onClose={close}>
          <AdviceSummary a={selected} hideItems />
          {sel.mode === 'edit' ? (
            tab.Edit && tab.editable?.(selected) && canAct ? (
              <div className="action-box">
                <tab.Edit a={selected} sub={sub} done={close} edit />
              </div>
            ) : <div className="alert">This record can no longer be edited – the next step has already been done.</div>
          ) : sel.mode === 'view' ? (
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
