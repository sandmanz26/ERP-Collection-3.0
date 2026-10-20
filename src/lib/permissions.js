// Role-based access. Each internal role sees a set of nav sections and capabilities.
export const NAV = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', group: 'Overview', roles: ['admin', 'sales', 'planner', 'production', 'finance'] },
  { path: '/pipeline', label: 'Pipeline', icon: 'pipeline', group: 'Sales', roles: ['admin', 'sales', 'planner'] },
  { path: '/calendar', label: 'Availability', icon: 'calendar', group: 'Sales', roles: ['admin', 'sales', 'planner', 'production'] },
  { path: '/events', label: 'Events', icon: 'sparkle', group: 'Operations', roles: ['admin', 'sales', 'planner', 'production', 'finance'] },
  { path: '/vendors', label: 'Vendors', icon: 'store', group: 'Operations', roles: ['admin', 'planner', 'production', 'finance'] },
  { path: '/staff', label: 'Staff & crew', icon: 'users', group: 'Operations', roles: ['admin', 'planner', 'production', 'finance'] },
  { path: '/dayof', label: 'Day-of mode', icon: 'phone', group: 'Operations', roles: ['admin', 'planner', 'production', 'crew'] },
  { path: '/finance', label: 'Finance', icon: 'wallet', group: 'Money', roles: ['admin', 'finance'] },
  { path: '/reports', label: 'Reports', icon: 'chart', group: 'Money', roles: ['admin', 'sales', 'finance'] },
  { path: '/automation', label: 'Communication', icon: 'mail', group: 'Workspace', roles: ['admin', 'sales', 'planner'] },
  { path: '/activity', label: 'Activity log', icon: 'list', group: 'Workspace', roles: ['admin', 'sales', 'planner', 'production', 'finance'] },
  { path: '/settings', label: 'Settings', icon: 'settings', group: 'Admin', roles: ['admin'] },
  { path: '/design-system', label: 'Design system', icon: 'palette', group: 'Admin', roles: ['admin'] },
  { path: '/portal', label: 'My event', icon: 'heart', group: 'Client portal', roles: ['client'] },
  { path: '/vendor-portal', label: 'My bookings', icon: 'truck', group: 'Vendor portal', roles: ['vendor'] },
  { path: '/activity', label: 'My activity', icon: 'list', group: 'Workspace', roles: ['crew'] },
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

/**
 * Notifications are addressed to roles, but external users must only ever see notifications for THEIR events:
 * clients → events of their client account; vendors → events they are booked on; crew → events they have a shift on.
 */
export function visibleNotifications(state, user) {
  return state.notifications.filter((n) => {
    if (user.role === 'admin') return true;
    const addressed = n.toRoles?.includes(user.role) || n.toUserIds?.includes(user.id);
    if (!addressed) return false;
    const ev = n.eventId ? state.events.find((e) => e.id === n.eventId) : null;
    if (user.role === 'client') return !!ev && ev.clientId === user.clientId;
    if (user.role === 'vendor') return !!ev && ev.vendorBookings.some((b) => b.vendorId === user.vendorId);
    if (user.role === 'crew') return !ev || ev.shifts.some((s) => s.staffId === user.staffId);
    return true;
  });
}
