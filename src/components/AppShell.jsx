import { Button } from '../design-system/index.js';
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { navFor, homeFor, visibleNotifications } from '../lib/permissions.js';
import { fmtDateTime } from '../lib/dates.js';

export default function AppShell({ children }) {
  const { state, act, user } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const myNotifs = visibleNotifications(state, user);
  const unread = myNotifs.filter((n) => !n.read).length;

  useEffect(() => {
    if (state.lastError && Date.now() - state.lastError.ts < 3000) {
      setToast({ kind: 'err', text: state.lastError.message });
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [state.lastError]);
  useEffect(() => {
    if (state.lastOk && Date.now() - state.lastOk.ts < 3000 && !['SYSTEM_TICK', 'SET_USER', 'NOTIFICATIONS_READ', 'DECOR_SYNCED'].includes(state.lastOk.type)) {
      setToast({ kind: 'ok', text: state.lastOk.summary });
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
  }, [state.lastOk]);

  const internal = state.users.filter((u) => !['client', 'vendor'].includes(u.role));
  const external = state.users.filter((u) => ['client', 'vendor'].includes(u.role));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="logo">L</span>{state.settings.company.name}</div>
        <nav>
          {navFor(user).map((n) => (
            <NavLink key={n.path + n.label} to={n.path} end={n.path === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ic">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          EO Management System · mock mode<br />
          No backend — data in localStorage.<br />
          {state.activityLog.length} actions logged.
        </div>
      </aside>
      <div className="main">
        {!state.online && <div className="offline-banner">OFFLINE — actions are saved on this device and will sync when back online ({state.offlineQueue.length} queued)</div>}
        <div className="topbar">
          <div className="grow muted" style={{ fontSize: 12 }}>
            Viewing as <b style={{ color: 'var(--ink)' }}>{user.name}</b> · {user.role}
          </div>
          <label className="row" style={{ fontSize: 12 }}>
            <span className="muted">Switch role/user</span>
            <select
              value={user.id}
              onChange={(e) => {
                act('SET_USER', { userId: e.target.value });
                const u = state.users.find((x) => x.id === e.target.value);
                nav(homeFor(u));
              }}
            >
              <optgroup label="Internal team">
                {internal.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
              </optgroup>
              <optgroup label="Portals (external)">
                {external.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
              </optgroup>
            </select>
          </label>
          <div style={{ position: 'relative' }}>
            <Button onClick={() => setOpen((o) => !o)}>
              🔔 {unread > 0 && <span className="badge danger">{unread}</span>}
            </Button>
            {open && (
              <div className="card notif-panel">
                <div className="card-head">
                  <h3>Notifications</h3>
                  <Button size="sm" onClick={() => act('NOTIFICATIONS_READ')}>Mark all read</Button>
                </div>
                {myNotifs.length === 0 && <div className="empty">Nothing yet</div>}
                {myNotifs.slice(0, 40).map((n) => (
                  <div key={n.id} className={`alert ${n.level === 'success' ? 'success' : n.level}`} style={{ opacity: n.read ? 0.6 : 1, cursor: n.eventId ? 'pointer' : 'default' }}
                    onClick={() => { if (n.eventId && !['client', 'vendor', 'crew'].includes(user.role)) { nav(`/events/${n.eventId}`); setOpen(false); } }}>
                    <div>
                      <div>{n.text}</div>
                      <small>{fmtDateTime(n.ts)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.kind === 'err' ? '⚠ ' : '✓ '}{toast.text}</div>}
    </div>
  );
}
