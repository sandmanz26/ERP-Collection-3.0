// Role-based access. Each internal role sees a set of nav sections and capabilities.
export const NAV = [
  { path: '/', label: 'Dashboard', icon: '◎', roles: ['admin', 'sales', 'planner', 'production', 'finance'] },
  { path: '/pipeline', label: 'CRM & Pipeline', icon: '◆', roles: ['admin', 'sales', 'planner'] },
  { path: '/calendar', label: 'Availability & Holds', icon: '▦', roles: ['admin', 'sales', 'planner', 'production'] },
  { path: '/events', label: 'Events', icon: '★', roles: ['admin', 'sales', 'planner', 'production', 'finance'] },
  { path: '/vendors', label: 'Vendors', icon: '⚑', roles: ['admin', 'planner', 'production', 'finance'] },
  { path: '/staff', label: 'Staff & Crew', icon: '☺', roles: ['admin', 'planner', 'production', 'finance'] },
  { path: '/finance', label: 'Finance', icon: '$', roles: ['admin', 'finance'] },
  { path: '/reports', label: 'Reports', icon: '▤', roles: ['admin', 'sales', 'finance'] },
  { path: '/automation', label: 'Communication', icon: '✉', roles: ['admin', 'sales', 'planner'] },
  { path: '/settings', label: 'Settings', icon: '⚙', roles: ['admin'] },
  { path: '/activity', label: 'Activity Log', icon: '☰', roles: ['admin', 'sales', 'planner', 'production', 'finance'] },
  { path: '/dayof', label: 'Day-of Mobile', icon: '▶', roles: ['admin', 'planner', 'production', 'crew'] },
  { path: '/portal', label: 'Client Portal', icon: '♥', roles: ['client'] },
  { path: '/vendor-portal', label: 'Vendor Portal', icon: '⚑', roles: ['vendor'] },
  { path: '/activity', label: 'My Activity', icon: '☰', roles: ['crew'] },
];

const CAPS = {
  admin: ['*'],
  sales: ['crm', 'proposal', 'contract', 'event.view', 'event.edit', 'message', 'hold'],
  planner: ['crm', 'event.view', 'event.edit', 'tasks', 'guests', 'vendors', 'ros', 'co', 'message', 'staff.schedule', 'hold', 'proposal', 'postevent'],
  production: ['event.view', 'ros', 'vendors', 'staff.schedule', 'decor', 'tasks'],
  finance: ['event.view', 'finance', 'co.invoice', 'postevent', 'vendors.pay'],
  crew: ['dayof'],
  client: ['portal'],
  vendor: ['vendorportal'],
};

export function can(user, cap) {
  if (!user) return false;
  const caps = CAPS[user.role] || [];
  return caps.includes('*') || caps.includes(cap) || caps.some((c) => cap.startsWith(`${c}.`));
}

export function navFor(user) {
  return NAV.filter((n) => n.roles.includes(user?.role)).filter((n, i, arr) => arr.findIndex((x) => x.path === n.path) === i);
}

export function homeFor(user) {
  if (user.role === 'client') return '/portal';
  if (user.role === 'vendor') return '/vendor-portal';
  if (user.role === 'crew') return '/dayof';
  return '/';
}

export function clientCan(user, perm) {
  return user?.role !== 'client' || (user.permissions || []).includes(perm);
}
