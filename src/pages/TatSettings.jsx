import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { SUBSYSTEMS, exitTat, minText, tatOf } from '../data.js';
import { Field, PageHead } from '../components/ui.jsx';

const SUB_ICON = { sales: '📤', purchase: '📥' };

/** Master → TAT Settings: how long a truck may stay inside after its final weighment. */
export default function TatSettings() {
  const { state, user, setTat } = useStore();
  const [open, setOpen] = useState({}); // which subsystem section is expanded (down arrow)
  if (user.role !== 'admin') return <div className="alert">Only the admin can view the TAT Settings page.</div>;

  return (
    <>
      <PageHead
        title="Master · TAT Settings"
        sub="After the Final Weighment the truck must leave (Gate-Out) within this time. If it is late, Gate-Out is blocked until the truck is weighed again (Re-Weighment on the Final Weighment page). Every re-weighment starts the time again. 0 = no TAT."
      />
      {SUBSYSTEMS.map((s) => {
        const t = tatOf(state.settings, s.key);
        const inside = state.advices.filter((a) => a.type === s.key).map((a) => exitTat(a, state.settings)).filter(Boolean);
        const late = inside.filter((x) => x.late).length;
        const isOpen = !!open[s.key];
        return (
          <div className="card pcard" key={s.key}>
            <div className="pcard-head" onClick={() => setOpen({ ...open, [s.key]: !isOpen })} aria-expanded={isOpen}>
              <svg className={isOpen ? '' : 'closed'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span className="pcard-ic">{SUB_ICON[s.key]}</span>
              <div className="pcard-t">
                <b>{s.label}</b>
                <span>Exit TAT: {Number(t.exitMin) ? minText(Number(t.exitMin)) : 'Off'} · {inside.length} inside · {late} late</span>
              </div>
            </div>

            {isOpen && (
              <div className="form-grid" style={{ padding: '0 16px 16px' }}>
                <Field label="Exit TAT after Final Weighment (minutes) *" hint={Number(t.exitMin) ? `= ${minText(Number(t.exitMin))}` : 'TAT is off – no re-weighment check'}>
                  <input type="number" min="0" step="5" value={t.exitMin}
                    onChange={(e) => setTat(s.key, { exitMin: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} />
                </Field>
                <Field label="Right now">
                  <input disabled value={`${inside.length} truck(s) inside after final weighment · ${late} late (re-weighment needed)`} />
                </Field>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
