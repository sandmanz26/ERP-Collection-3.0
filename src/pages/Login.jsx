import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Button, Field, Alert, Avatar, Badge, Icon, PillSelect } from '../design-system/index.js';
import { DEMO_PASSWORD } from '../data/accounts.js';
import { ROLES } from '../data/config.js';

const roleLabel = (r) => ROLES.find((x) => x.id === r)?.label ?? r;
const STATUS_TONE = { active: 'ok', invited: 'info', suspended: 'danger' };

/** Mock sign-in. Every attempt (including failures and lockouts) is written to the activity log by the LOGIN action. */
export default function Login() {
  const { state, act } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState('team');
  const [touched, setTouched] = useState(false);
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
          <div className="muted">Use your work email. This demo has no backend; accounts are listed below.</div>
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

        <div className="demo-accounts">
          <div className="demo-head">
            <span><b>Demo accounts</b> · password <code>{DEMO_PASSWORD}</code></span>
            <PillSelect options={[{ id: 'team', label: `Team (${team.length})` }, { id: 'portal', label: `Portals (${portals.length})` }]} value={group} onChange={setGroup} />
          </div>
          {(group === 'team' ? team : portals).map((u) => (
            <button key={u.id} type="button" className="demo-row" onClick={() => fill(u)} title={u.status === 'suspended' ? 'Suspended accounts cannot sign in (try it to see the message)' : `Fill in ${u.email}`}>
              <Avatar name={u.name} />
              <span className="who"><span><b>{u.name}</b> · {roleLabel(u.role)}</span><span>{u.email}{u.title ? ` · ${u.title}` : ''}</span></span>
              <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
            </button>
          ))}
        </div>
        <div className="faint text-xs">Mock authentication for demonstration only. Passwords are not hashed and there is no single sign-on; see HANDOFF.md before connecting a real backend.</div>
      </main>
    </div>
  );
}
