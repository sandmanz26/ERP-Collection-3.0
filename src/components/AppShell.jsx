import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Icon, Avatar, Badge, Toast } from '../design-system/index.js';
import { navFor, homeFor, visibleNotifications } from '../lib/permissions.js';
import { fmtDateTime } from '../lib/dates.js';
import { ROLES } from '../data/config.js';
import { useWorkspace } from '../platform/PlatformStore.jsx';
import { SubscriptionBanner } from '../platform/SaasChrome.jsx';
import { ROUTE_FEATURE } from '../platform/entitlements.js';
import { PLATFORM } from '../platform/plans.js';

const roleLabel = (r) => ROLES.find((x) => x.id === r)?.label ?? r;

/** Template: authenticated app shell — grouped sidebar (drawer on small screens), search, notifications, user menu. */
export default function AppShell({ children }) {
  const { state, user } = useStore();
  const ws = useWorkspace();
  const locked = (path) => ws && ROUTE_FEATURE[path] && !ws.ent.features.has(ROUTE_FEATURE[path]);
  const loc = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);
  useEffect(() => setDrawer(false), [loc.pathname]);

  useEffect(() => {
    if (state.lastError && Date.now() - state.lastError.ts < 3000) {
      setToast({ kind: 'err', text: state.lastError.message });
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.lastError]);
  useEffect(() => {
    if (state.lastOk && Date.now() - state.lastOk.ts < 3000 && !['SYSTEM_TICK', 'SET_USER', 'LOGIN', 'NOTIFICATIONS_READ', 'DECOR_SYNCED'].includes(state.lastOk.type)) {
      setToast({ kind: 'ok', text: state.lastOk.summary });
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.lastOk]);

  const groups = useMemo(() => {
    const out = [];
    navFor(user).forEach((n) => {
      let g = out.find((x) => x.name === n.group);
      if (!g) out.push((g = { name: n.group, items: [] }));
      g.items.push(n);
    });
    return out;
  }, [user]);

  return (
    <div className={`app ${drawer ? 'drawer-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand"><span className="logo" aria-hidden>{state.settings.company.name.trim()[0]?.toUpperCase()}</span><span>{state.settings.company.name}</span></div>
        <nav>
          {groups.map((g) => (
            <div key={g.name} className="nav-section">
              <div className="nav-group">{g.name}</div>
              {g.items.map((n) => (
                <NavLink key={n.path + n.label} to={n.path} end={n.path === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon name={n.icon} size={17} /><span>{n.label}</span>{locked(n.path) && <Icon name="lock" size={13} className="nav-lock" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">{ws ? <>{ws.tenant.slug}.{PLATFORM.domain} · {ws.ent.plan.name}{ws.ent.status === 'trialing' ? ' trial' : ws.ent.status !== 'active' ? ` · ${ws.ent.status.replace('_', ' ')}` : ''}{ws.isDemo ? ' · demo' : ''}</> : 'Demo workspace'} · data stays in this browser · {state.activityLog.length} actions logged</div>
      </aside>
      <div className="drawer-scrim" onClick={() => setDrawer(false)} aria-hidden />
      <div className="main">
        <SubscriptionBanner />
        {!state.online && <div className="offline-banner" role="status"><Icon name="wifiOff" size={14} /> Offline. Changes are saved on this device and sync when you reconnect ({state.offlineQueue.length} queued).</div>}
        <header className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setDrawer((d) => !d)} aria-label="Open navigation" aria-expanded={drawer}><Icon name="menu" size={20} /></button>
          {!['client', 'vendor', 'crew'].includes(user.role) && <GlobalSearch />}
          <span className="grow" />
          <Notifications />
          <UserMenu />
        </header>
        <main className="content" id="main">{children}</main>
      </div>
      {toast && <Toast kind={toast.kind}>{toast.text}</Toast>}
    </div>
  );
}

/** Popover helper: closes on outside click and Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

function GlobalSearch() {
  const { state } = useStore();
  const nav = useNavigate();
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const hit = (s) => String(s ?? '').toLowerCase().includes(t);
    return [
      ...state.events.filter((e) => hit(e.name) || hit(e.venue?.name)).slice(0, 6).map((e) => ({ kind: 'Event', label: e.name, sub: e.date ?? 'no date', to: `/events/${e.id}` })),
      ...state.clients.filter((c) => hit(c.name) || hit(c.email)).slice(0, 4).map((c) => { const ev = state.events.find((e) => e.clientId === c.id); return { kind: 'Client', label: c.name, sub: c.email, to: ev ? `/events/${ev.id}` : '/events' }; }),
      ...state.vendors.filter((v) => hit(v.name) || hit(v.category)).slice(0, 4).map((v) => ({ kind: 'Vendor', label: v.name, sub: v.category, to: '/vendors' })),
      ...state.staff.filter((s) => hit(s.name)).slice(0, 3).map((s) => ({ kind: 'Staff', label: s.name, sub: s.type, to: '/staff' })),
      ...state.events.flatMap((e) => (e.workers || []).filter((w) => hit(w.name) || hit(w.credentialCode)).map((w) => ({ kind: 'Crew', label: w.name, sub: `${w.company} · ${e.name}`, to: `/events/${e.id}?tab=people` }))).slice(0, 3),
    ];
  }, [q, state]);
  const go = (r) => { nav(r.to); setQ(''); setOpen(false); inputRef.current?.blur(); };
  return (
    <div className="search-box" ref={ref}>
      <Icon name="search" size={16} />
      <input ref={inputRef} id="global-search" value={q} placeholder="Search events, clients, vendors, crew" aria-label="Search" autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && results[active]) go(results[active]);
        }} />
      <kbd>/</kbd>
      {open && q.trim().length >= 2 && (
        <div className="popover search-results" role="listbox">
          {results.length === 0 && <div className="empty">No matches for “{q}”</div>}
          {results.map((r, i) => (
            <button key={`${r.kind}${r.label}${i}`} role="option" aria-selected={i === active} className={`search-row ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              <Badge>{r.kind}</Badge><span className="search-label">{r.label}</span><span className="faint text-xs">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { state, act, user } = useStore();
  const nav = useNavigate();
  const { open, setOpen, ref } = usePopover();
  const mine = visibleNotifications(state, user);
  const unread = mine.filter((n) => !n.read).length;
  return (
    <div className="popover-anchor" ref={ref}>
      <button className="btn ghost icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Icon name="bell" size={18} />{unread > 0 && <span className="count-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover notif-panel">
          <div className="popover-head"><b>Notifications</b>{unread > 0 && <button className="btn sm ghost" onClick={() => act('NOTIFICATIONS_READ')}>Mark all read</button>}</div>
          {mine.length === 0 && <div className="empty">You're all caught up.</div>}
          {mine.slice(0, 40).map((n) => (
            <button key={n.id} className={`notif-row ${n.read ? 'read' : ''} tone-line-${n.level}`}
              onClick={() => { if (n.eventId && !['client', 'vendor', 'crew'].includes(user.role)) { nav(`/events/${n.eventId}`); setOpen(false); } }}>
              <span>{n.text}</span><span className="faint text-xs">{fmtDateTime(n.ts)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { state, act, user } = useStore();
  const ws = useWorkspace();
  const nav = useNavigate();
  // Jumping into other accounts without a password is a demo convenience only — never in a real workspace.
  const canSwitch = !ws || ws.isDemo;
  const { open, setOpen, ref } = usePopover();
  const team = state.users.filter((u) => !['client', 'vendor'].includes(u.role) && u.status !== 'suspended');
  const portals = state.users.filter((u) => ['client', 'vendor'].includes(u.role));
  const switchTo = (u) => { act('SET_USER', { userId: u.id }); setOpen(false); nav(homeFor(u)); };
  return (
    <div className="popover-anchor" ref={ref}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu">
        <Avatar name={user.name} />
        <span className="user-chip-text"><b>{user.name}</b><span>{user.title ?? roleLabel(user.role)}</span></span>
        <Icon name="chevron" size={14} className="rot90" />
      </button>
      {open && (
        <div className="popover user-menu">
          <div className="user-menu-head">
            <Avatar name={user.name} />
            <div><b>{user.name}</b><div className="faint text-sm">{user.email}</div><Badge tone="brand">{roleLabel(user.role)}</Badge></div>
          </div>
          <div className="menu-label">Theme</div>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {[['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([id, icon, label]) => (
              <button key={id} role="radio" aria-checked={state.theme === id} className={state.theme === id ? 'on' : ''} onClick={() => act('THEME_SET', { theme: id })}><Icon name={icon} size={14} /> {label}</button>
            ))}
          </div>
          {ws && (
            <>
              <div className="menu-label">Workspace</div>
              <div className="menu-sub" style={{ padding: '0 12px 6px' }}><b>{ws.tenant.name}</b><div className="faint text-xs">{ws.tenant.slug}.{PLATFORM.domain} · {ws.ent.plan.name}</div></div>
              {user.role === 'admin' && <button className="menu-row" onClick={() => { setOpen(false); nav('/settings?tab=billing'); }}><Icon name="wallet" size={16} /> Plan &amp; billing</button>}
              <button className="menu-row" onClick={() => { setOpen(false); act('LOGOUT'); ws.leave('/login'); }}><Icon name="external" size={16} /> Switch workspace</button>
            </>
          )}
          {canSwitch && <><div className="menu-label">Switch demo account</div>
          <div className="menu-scroll">
            {[['Team', team], ['Client & vendor portals', portals]].map(([label, list]) => (
              <div key={label}>
                <div className="menu-sub">{label}</div>
                {list.map((u) => (
                  <button key={u.id} className={`menu-row ${u.id === user.id ? 'current' : ''}`} onClick={() => switchTo(u)} disabled={u.id === user.id}>
                    <Avatar name={u.name} /><span className="menu-row-text"><span>{u.name}</span><span className="faint text-xs">{roleLabel(u.role)}</span></span>
                    {u.id === user.id && <Icon name="check" size={14} />}
                  </button>
                ))}
              </div>
            ))}
          </div></>}
          <button className="menu-row signout" onClick={() => { act('LOGOUT'); nav('/'); }}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      )}
    </div>
  );
}
