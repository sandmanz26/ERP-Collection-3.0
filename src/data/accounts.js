// Mock authentication data for the demo. Passwords are stored in plain text ONLY because there is no backend;
// a real deployment must use a hashed credential store + SSO/MFA (see HANDOFF.md → limits).
export const DEMO_PASSWORD = 'demo1234';
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

/** Profile + credential fields merged into seed users by id. */
export const ACCOUNT_PROFILES = {
  u_admin: { title: 'Owner & Managing Director', phone: '+1 212 555 0100', timezone: 'America/New_York', status: 'active', mfa: true },
  u_sales: { title: 'Senior Account Manager', phone: '+1 212 555 0110', timezone: 'America/New_York', status: 'active' },
  u_sales2: { title: 'Account Manager — Europe', phone: '+33 6 55 10 10 10', timezone: 'Europe/Paris', status: 'active' },
  u_planner: { title: 'Lead Event Planner', phone: '+1 212 555 0901', timezone: 'America/New_York', status: 'active' },
  u_planner2: { title: 'Event Planner — Paris office', phone: '+33 6 55 90 90 90', timezone: 'Europe/Paris', status: 'active' },
  u_prod: { title: 'Production & Logistics Lead', phone: '+1 212 555 0902', timezone: 'America/New_York', status: 'active' },
  u_fin: { title: 'Finance Manager', phone: '+1 212 555 0120', timezone: 'America/New_York', status: 'active', mfa: true },
  u_crew: { title: 'Day-of Coordinator (freelance)', phone: '+1 646 555 0903', timezone: 'America/New_York', status: 'active' },
  u_ops: { title: 'Operations Admin', phone: '+1 212 555 0130', timezone: 'America/New_York', status: 'active' },
  u_invited: { title: 'Junior Planner', phone: '+1 917 555 0140', timezone: 'America/New_York', status: 'invited' },
  u_former: { title: 'Account Manager (left Aug 2026)', phone: '', timezone: 'America/New_York', status: 'suspended' },
};

/** Extra team accounts that exist only for the login/user-management demo. */
export const EXTRA_TEAM_USERS = [
  { id: 'u_ops', name: 'Rachel Ng', role: 'admin', email: 'rachel@lumiere.events' },
  { id: 'u_invited', name: 'Mei Tan', role: 'planner', email: 'mei@lumiere.events' },
  { id: 'u_former', name: 'Tyler Grant', role: 'sales', email: 'tyler@lumiere.events' },
];
