// "Route" sidebar: the core modules are drawn as consecutive stops on one RFQ → Invoice route,
// each with a live caption; platform tools sit in a compact "control tower" grid below.
import { useMemo } from 'react';
import { Tooltip } from 'antd';
import {
  DashboardOutlined, InboxOutlined, FileTextOutlined, ContainerOutlined, FileSearchOutlined, AimOutlined, DollarOutlined,
  AuditOutlined, BarChartOutlined, ApiOutlined, SettingOutlined, CloudServerOutlined, DoubleLeftOutlined, DoubleRightOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import { pendingItems } from '../lib/inbox.js';
import { REGIONS } from '../lib/reference.js';
import { fromNow } from './common.jsx';

function useStats() {
  const { scoped, lookup, user } = useStore();
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pending = pendingItems(scoped, lookup);
    const count = (arr, fn) => arr.filter(fn).length;
    return {
      approvals: pending.length,
      mine: pending.filter((p) => user.role === 'admin' || p.role === user.role).length,
      rfq: { alert: count(scoped.rfqs, (r) => r.status === 'review'), caption: `${count(scoped.rfqs, (r) => r.status === 'new')} new · ${count(scoped.rfqs, (r) => r.status === 'review')} to review` },
      quote: { alert: count(scoped.quotes, (q) => q.status === 'pending_approval'), caption: `${count(scoped.quotes, (q) => q.status === 'pending_approval')} pending · ${count(scoped.quotes, (q) => q.status === 'sent')} with customer` },
      shipment: { alert: count(scoped.shipments, (s) => s.status === 'booking_pending'), caption: `${count(scoped.shipments, (s) => ['booked', 'in_transit', 'arrived'].includes(s.status))} active · ${count(scoped.shipments, (s) => s.status === 'booking_pending')} to book` },
      document: { alert: count(scoped.documents, (d) => d.status === 'mismatch'), caption: `${count(scoped.documents, (d) => d.status === 'mismatch')} mismatches open` },
      tracking: { alert: count(scoped.shipments, (s) => s.cwKey && s.status !== 'delivered' && s.milestones.some((m) => !m.actual && m.planned < today)), caption: `${count(scoped.shipments, (s) => s.status === 'in_transit')} in transit · ${scoped.shipments.flatMap((s) => s.notifications.filter((n) => n.status === 'draft')).length} updates` },
      invoice: { alert: count(scoped.apInvoices, (a) => a.status === 'variance') + count(scoped.arInvoices, (a) => a.status === 'pending_approval'), caption: `${count(scoped.arInvoices, (a) => a.status === 'pending_approval')} AR · ${count(scoped.apInvoices, (a) => a.status === 'variance')} AP variance` },
    };
  }, [scoped, lookup, user.role]);
}

const ROUTE = [
  { key: '/rfqs', label: 'RFQ inbox', icon: <InboxOutlined />, stat: 'rfq' },
  { key: '/quotes', label: 'Quotations', icon: <FileTextOutlined />, stat: 'quote' },
  { key: '/shipments', label: 'Bookings', icon: <ContainerOutlined />, stat: 'shipment' },
  { key: '/documents', label: 'Documents', icon: <FileSearchOutlined />, stat: 'document' },
  { key: '/tracking', label: 'Tracking', icon: <AimOutlined />, stat: 'tracking' },
  { key: '/invoicing', label: 'Invoicing', icon: <DollarOutlined />, stat: 'invoice' },
];

const TOWER = [
  { key: '/audit', label: 'AI audit', icon: <AuditOutlined /> },
  { key: '/usage', label: 'Usage', icon: <BarChartOutlined /> },
  { key: '/connectors', label: 'Connectors', icon: <ApiOutlined /> },
  { key: '/settings', label: 'Settings', icon: <SettingOutlined /> },
  { key: '/platform', label: 'Tenants', icon: <CloudServerOutlined /> },
];

export default function Sidebar({ selected, onNavigate, collapsed, onToggle }) {
  const { tenant, scoped } = useStore();
  const stats = useStats();
  const region = REGIONS[tenant.region];
  const cw = scoped.connectors.find((c) => c.connectorKey === 'cargowise');
  const activeIdx = ROUTE.findIndex((r) => r.key === selected);
  const tip = (title, node) => (collapsed ? <Tooltip title={title} placement="right">{node}</Tooltip> : node);

  return (
    <nav className={`fps ${collapsed ? 'fps--rail' : ''}`} aria-label="Main navigation">
      <div className="fps-brand">
        <div className="fps-mark" aria-hidden>
          <svg viewBox="0 0 32 32" width="22" height="22"><path d="M4 22c6-1 10-5 12-12 2 7 6 11 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><circle cx="16" cy="9" r="2.6" fill="currentColor" /><path d="M3 26h26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 3" /></svg>
        </div>
        {!collapsed && (
          <div className="fps-brand-text">
            <b>FreightPilot</b>
            <span>RFQ → Invoice</span>
          </div>
        )}
        {onToggle && (
          <button type="button" className="fps-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
          </button>
        )}
      </div>

      <div className="fps-scroll">
        {tip(`Approvals — ${stats.approvals} waiting`, (
          <button type="button" className={`fps-cta ${selected === '/approvals' ? 'is-active' : ''}`} onClick={() => onNavigate('/approvals')}>
            <span className="fps-cta-count">{stats.mine}</span>
            {!collapsed && (
              <span className="fps-cta-text">
                <b>Waiting for you</b>
                <small>{stats.approvals} items need a person</small>
              </span>
            )}
            {!collapsed && <ArrowRightOutlined className="fps-cta-arrow" />}
          </button>
        ))}

        {tip('Dashboard', (
          <button type="button" className={`fps-item ${selected === '/' ? 'is-active' : ''}`} onClick={() => onNavigate('/')}>
            <span className="fps-ico"><DashboardOutlined /></span>
            {!collapsed && <span className="fps-label">Dashboard</span>}
          </button>
        ))}

        {!collapsed && <div className="fps-section"><span>Shipment route</span><i /></div>}
        <ol className="fps-route">
          {ROUTE.map((r, i) => {
            const s = stats[r.stat];
            const state = i === activeIdx ? 'is-active' : activeIdx >= 0 && i < activeIdx ? 'is-passed' : '';
            return (
              <li key={r.key} className={`fps-stop ${state}`}>
                {tip(`${r.label} — ${s.caption}`, (
                  <button type="button" onClick={() => onNavigate(r.key)}>
                    <span className="fps-node">
                      <span className="fps-node-ico">{r.icon}</span>
                      {s.alert > 0 && <span className="fps-node-alert">{s.alert > 99 ? '99+' : s.alert}</span>}
                    </span>
                    {!collapsed && (
                      <span className="fps-stop-text">
                        <span className="fps-stop-head"><em>{String(i + 1).padStart(2, '0')}</em>{r.label}</span>
                        <small>{s.caption}</small>
                      </span>
                    )}
                  </button>
                ))}
              </li>
            );
          })}
        </ol>

        {!collapsed && <div className="fps-section"><span>Control tower</span><i /></div>}
        <div className="fps-tower">
          {TOWER.map((t) => tip(t.label, (
            <button key={t.key} type="button" className={`fps-tile ${selected === t.key ? 'is-active' : ''}`} onClick={() => onNavigate(t.key)}>
              <span className="fps-tile-ico">{t.icon}</span>
              {!collapsed && <span>{t.label}</span>}
            </button>
          )))}
        </div>
      </div>

      {tip(`${tenant.name} · ${region?.name}`, (
        <div className="fps-dock">
          <span className="fps-dock-flag">{region?.flag}</span>
          {!collapsed && (
            <span className="fps-dock-text">
              <b>{tenant.name}</b>
              <small><span className={`fps-pulse ${cw?.status === 'connected' ? '' : 'is-down'}`} />{cw?.status === 'connected' ? `eAdaptor live · ${cw.lastSyncAt ? fromNow(cw.lastSyncAt) : 'idle'}` : 'CargoWise not connected'}</small>
              <small className="fps-dock-region">{tenant.region}</small>
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
