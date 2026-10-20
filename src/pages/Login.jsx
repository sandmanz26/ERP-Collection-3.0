import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Button, Field, Alert, Avatar, Badge, Icon, PillSelect, Modal } from '../design-system/index.js';
import { DEMO_PASSWORD } from '../data/accounts.js';
import { ROLES } from '../data/config.js';

const roleLabel = (r) => ROLES.find((x) => x.id === r)?.label ?? r;
const STATUS_TONE = { active: 'ok', invited: 'info', suspended: 'danger' };
// One representative account per persona — keeps the sign-in screen short; the full list lives in a dialog.
const QUICK = [
  { id: 'u_admin', label: 'Owner / admin', icon: 'key' },
  { id: 'u_sales', label: 'Sales', icon: 'pipeline' },
  { id: 'u_planner', label: 'Planner', icon: 'sparkle' },
  { id: 'u_prod', label: 'Production', icon: 'hardhat' },
  { id: 'u_fin', label: 'Finance', icon: 'wallet' },
  { id: 'u_crew', label: 'Day-of crew', icon: 'phone' },
  { id: 'u_client1', label: 'Client portal', icon: 'heart' },
  { id: 'u_vendor1', label: 'Vendor portal', icon: 'truck' },
];

/** Mock sign-in. Every attempt (including failures and lockouts) is written to the activity log by the LOGIN action. */
export default function Login() {
  const { state, act } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState('team');
  const [touched, setTouched] = useState(false);
  const [all, setAll] = useState(false);
  const err = state.lastError?.type === 'LOGIN' ? state.lastError.message : null;
  const team = state.users.filter((u) => !['client', 'vendor'].includes(u.role));
  const portals = state.users.filter((u) => ['client', 'vendor'].includes(u.role));
  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!email || !password) return;
    setBusy(true);
    setTimeout(() => { act('LOGIN', { email, password }); setBusy(false); }, 350);
  };
  const quick = (u) => { setEmail(u.email); setPassword(DEMO_PASSWORD); setBusy(true); setTimeout(() => { act('LOGIN', { email: u.email, password: DEMO_PASSWORD }); setBusy(false); }, 250); };
  const fill = (u) => { setEmail(u.email); setPassword(DEMO_PASSWORD); setTouched(false); document.getElementById('login-password')?.focus(); };

  return (
    <div className="auth">
      <section className="auth-brand" aria-label={state.settings.company.name}>
        <div className="logo-row"><span className="logo">L</span>{state.settings.company.name}</div>
        <h1>Every wedding, launch and offsite in one run of show.</h1>
        <p>Leads, proposals, contracts, vendors, crews and the minute-by-minute timeline, shared by the office team and the coordinator on the venue floor.</p>
        <div className="ros-preview" aria-label="Sample run of show">
          <div className="ros-head"><span>Sat · Grand Hall</span><span>Run of show</span></div>
          {[['16:00', 'Processional', 'done'], ['16:05', 'Ceremony', 'done'], ['18:00', 'Grand entrance', 'live'], ['18:10', 'First dance', 'next'], ['18:20', 'Dinner service', 'next']].map(([t, a, s]) => (
            <div className="ros-line" key={t}><time>{t}</time><span>{a}</span><span className={`st ${s === 'live' ? 'live' : ''}`}>{s === 'live' ? 'In progress' : s === 'done' ? 'Done' : 'Up next'}</span></div>
          ))}
        </div>
      </section>

      <main className="auth-main">
        <div>
          <h2>Sign in</h2>
          <div className="muted">Use your work email and password.</div>
        </div>
        {err && <Alert tone="danger">{err}</Alert>}
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="Work email" error={touched && !email ? 'Enter your email address' : null}>
            <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@lumiere.events" autoFocus />
          </Field>
          <Field label="Password" error={touched && !password ? 'Enter your password' : null}>
            <span className="pw-field">
              <input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
              <button type="button" className="btn ghost sm" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}><Icon name={show ? 'eyeOff' : 'eye'} size={16} /></button>
            </span>
          </Field>
          <div className="row between text-sm">
            <span className="faint"><Icon name="shield" size={13} /> 5 failed attempts lock the account for 15 minutes</span>
          </div>
          <Button type="submit" variant="primary" loading={busy} className="auth-submit">Sign in</Button>
        </form>

        <div className="quick-roles">
          <div className="row between"><span className="faint text-sm">Or explore as a demo role</span><button type="button" className="link-btn text-sm" onClick={() => setAll(true)}>All {team.length + portals.length} accounts</button></div>
          <div className="quick-grid">
            {QUICK.map((q) => {
              const u = state.users.find((x) => x.id === q.id);
              return (
                <button key={q.id} type="button" className="quick-role" onClick={() => quick(u)} title={`Sign in as ${u.name} (${u.email})`}>
                  <Icon name={q.icon} size={16} /><span><b>{q.label}</b><span>{u.name}</span></span>
                </button>
              );
            })}
          </div>
        </div>
        {all && (
          <Modal title="Demo accounts" onClose={() => setAll(false)} footer={<span className="faint text-sm">Password for every account: <code>{DEMO_PASSWORD}</code></span>}>
            <div className="row mb"><PillSelect options={[{ id: 'team', label: `Team (${team.length})` }, { id: 'portal', label: `Client & vendor portals (${portals.length})` }]} value={group} onChange={setGroup} /></div>
            <div className="demo-accounts">
              {(group === 'team' ? team : portals).map((u) => (
                <button key={u.id} type="button" className="demo-row" onClick={() => { fill(u); setAll(false); }} title={u.status === 'suspended' ? 'Suspended accounts cannot sign in (try it to see the message)' : `Use ${u.email}`}>
                  <Avatar name={u.name} />
                  <span className="who"><span><b>{u.name}</b> · {roleLabel(u.role)}</span><span>{u.email}{u.title ? ` · ${u.title}` : ''}</span></span>
                  <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                </button>
              ))}
            </div>
          </Modal>
        )}
        <div className="faint text-xs">Mock authentication for demonstration only. Passwords are not hashed and there is no single sign-on; see HANDOFF.md before connecting a real backend.</div>
      </main>
    </div>
  );
}
