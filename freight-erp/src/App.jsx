import { useState } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Layout, Select, Space, Tag, Tooltip, Dropdown, Avatar, Button, Typography, Popconfirm, Drawer, Grid } from 'antd';
import { CloudServerOutlined, BulbOutlined, ReloadOutlined, MenuOutlined, SwapOutlined } from '@ant-design/icons';
import { useStore } from './store/StoreProvider.jsx';
import { REGIONS, ROLES } from './lib/reference.js';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rfqs from './pages/Rfqs.jsx';
import RfqDetail from './pages/RfqDetail.jsx';
import Quotes from './pages/Quotes.jsx';
import QuoteDetail from './pages/QuoteDetail.jsx';
import Shipments from './pages/Shipments.jsx';
import ShipmentDetail from './pages/ShipmentDetail.jsx';
import Documents from './pages/Documents.jsx';
import Tracking from './pages/Tracking.jsx';
import Invoicing from './pages/Invoicing.jsx';
import Approvals from './pages/Approvals.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Usage from './pages/Usage.jsx';
import Connectors from './pages/Connectors.jsx';
import Settings from './pages/Settings.jsx';
import Platform from './pages/Platform.jsx';

const { Header, Content } = Layout;

export default function AppRoutes({ dark, toggleDark }) {
  const { state, tenant, user, scoped, setSession, reset } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('freightpilot-rail') === '1';
    } catch {
      return false;
    }
  });
  const toggleRail = () => setCollapsed((v) => {
    try {
      localStorage.setItem('freightpilot-rail', v ? '0' : '1');
    } catch {
      /* ignore */
    }
    return !v;
  });
  const selected = '/' + (location.pathname.split('/')[1] || '');
  const region = REGIONS[tenant.region];
  const tenantUsers = scoped.users.filter((u) => u.active !== false);

  const go = (key) => {
    navigate(key);
    setMobileNav(false);
  };

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      {screens.lg ? (
        <div style={{ position: 'sticky', top: 0, height: '100vh', zIndex: 20 }}>
          <Sidebar selected={selected} onNavigate={go} collapsed={collapsed} onToggle={toggleRail} />
        </div>
      ) : (
        <Drawer open={mobileNav} onClose={() => setMobileNav(false)} placement="left" width={264} styles={{ body: { padding: 0, background: '#0c1224' }, header: { display: 'none' } }}>
          <Sidebar selected={selected} onNavigate={go} />
        </Drawer>
      )}
      <Layout>
        <Header className="fp-header">
          {!screens.lg && <Button icon={<MenuOutlined />} onClick={() => setMobileNav(true)} />}
          <Tooltip title="Switch tenant (forwarder). Data, users and settings are fully separated.">
            <Select
              value={tenant.id}
              style={{ minWidth: screens.md ? 260 : 150 }}
              onChange={(id) => setSession({ tenantId: id })}
              suffixIcon={<SwapOutlined />}
              options={state.tenants.filter((t) => t.status !== 'suspended').map((t) => ({ value: t.id, label: <span>{REGIONS[t.region]?.flag} {t.name}</span> }))}
            />
          </Tooltip>
          {screens.md && (
            <Tooltip title={`${region?.name} · ${region?.law} · AI processing: ${region?.ai}`}>
              <Tag color="geekblue" icon={<CloudServerOutlined />}>Data hosted in {tenant.region}</Tag>
            </Tooltip>
          )}
          <div style={{ flex: 1 }} />
          <Space size={screens.md ? 'middle' : 'small'}>
            <Tooltip title="Toggle dark mode"><Button shape="circle" icon={<BulbOutlined />} onClick={toggleDark} type={dark ? 'primary' : 'default'} /></Tooltip>
            <Popconfirm title="Regenerate all mock data?" description="Clears local changes for every tenant." onConfirm={reset}>
              <Tooltip title="Reset demo data"><Button shape="circle" icon={<ReloadOutlined />} /></Tooltip>
            </Popconfirm>
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [user?.id],
                items: [
                  { type: 'group', label: 'Act as (demo user switcher)', children: tenantUsers.map((u) => ({ key: u.id, label: <Space><span>{u.name}</span><Tag color={ROLES[u.role]?.color}>{ROLES[u.role]?.label}</Tag></Space> })) },
                ],
                onClick: ({ key }) => setSession({ userByTenant: { [tenant.id]: key } }),
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: '#2f54eb' }}>{user?.name?.split(' ').map((p) => p[0]).join('').slice(0, 2)}</Avatar>
                {screens.md && (
                  <div style={{ lineHeight: 1.15 }}>
                    <div style={{ fontWeight: 600 }}>{user?.name}</div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{ROLES[user?.role]?.label}</Typography.Text>
                  </div>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content className="fp-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/rfqs" element={<Rfqs />} />
            <Route path="/rfqs/:id" element={<RfqDetail />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/quotes/:id" element={<QuoteDetail />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/shipments/:id" element={<ShipmentDetail />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/tracking" element={<Tracking />} />
            <Route path="/invoicing" element={<Invoicing />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/connectors" element={<Connectors />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/platform" element={<Platform />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
