// Central reducer. Every action passes through here and is appended to state.activityLog (audit trail).
import { todayISO } from '../lib/dates.js';
import { BusinessError } from './handlers/common.js';
import { systemHandlers } from './handlers/system.js';
import { crmHandlers } from './handlers/crm.js';
import { salesHandlers } from './handlers/sales.js';
import { financeHandlers } from './handlers/finance.js';
import { planningHandlers } from './handlers/planning.js';
import { vendorHandlers } from './handlers/vendors.js';
import { guestHandlers } from './handlers/guests.js';
import { opsHandlers } from './handlers/ops.js';
import { settingsHandlers } from './handlers/settings.js';
import { workforceHandlers } from './handlers/workforce.js';

export const HANDLERS = {
  ...systemHandlers,
  ...crmHandlers,
  ...salesHandlers,
  ...financeHandlers,
  ...planningHandlers,
  ...vendorHandlers,
  ...guestHandlers,
  ...opsHandlers,
  ...settingsHandlers,
  ...workforceHandlers,
};

const MAX_LOG = 2000;
let seq = 0;

export function reducer(state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) {
    console.warn('Unknown action', action.type);
    return state;
  }
  const draft = structuredClone(state);
  draft.effects = [];
  const user = draft.users.find((u) => u.id === draft.currentUserId);
  const today = todayISO();
  const ctx = {
    state: draft,
    user,
    today,
    sideEffects: draft.effects,
    id: (p) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}`,
    ev(eventId) {
      const e = draft.events.find((x) => x.id === eventId);
      if (!e) throw new BusinessError(`Event ${eventId} not found`);
      return e;
    },
    next(counter) {
      draft.settings.counters[counter] += 1;
      return draft.settings.counters[counter];
    },
    notify({ toRoles = [], toUserIds = [], eventId = null, text, level = 'info' }) {
      draft.notifications.unshift({ id: `ntf_${Date.now().toString(36)}${(++seq).toString(36)}`, ts: new Date().toISOString(), toRoles, toUserIds, eventId, text, level, read: false });
      draft.notifications = draft.notifications.slice(0, 200);
    },
  };
  try {
    const res = handler(ctx, action.payload || {});
    const r = typeof res === 'string' ? { summary: res } : res || {};
    if (r.skipLog) return { ...draft, lastError: null };
    const actor = r.actorId ? draft.users.find((u) => u.id === r.actorId) : user;
    const offline = draft.online === false && action.type !== 'SET_ONLINE';
    draft.activityLog.unshift({
      id: `log_${Date.now().toString(36)}${(++seq).toString(36)}`,
      ts: new Date().toISOString(),
      userId: actor?.id ?? 'system',
      userName: action.system ? 'System (automation)' : actor?.name ?? r.actor ?? 'Anonymous',
      role: action.system ? 'system' : actor?.role ?? (r.actor ? 'anonymous' : 'system'),
      type: action.type,
      eventId: r.eventId ?? action.payload?.eventId ?? null,
      summary: r.summary ?? action.type,
      status: r.error ? 'rejected' : 'ok',
      sync: offline ? 'pending' : undefined,
    });
    if (offline) draft.offlineQueue.push({ type: action.type, at: new Date().toISOString() });
    draft.activityLog = draft.activityLog.slice(0, MAX_LOG);
    draft.lastError = r.error ? { message: r.error, ts: Date.now(), type: action.type } : null;
    draft.lastOk = r.error ? null : { type: action.type, ts: Date.now(), summary: r.summary };
    return draft;
  } catch (err) {
    if (!(err instanceof BusinessError)) console.error(err);
    // Rejected attempts are logged too (audit), but state is otherwise unchanged.
    const next = { ...state };
    next.activityLog = [
      {
        id: `log_${Date.now().toString(36)}${(++seq).toString(36)}`,
        ts: new Date().toISOString(),
        userId: user?.id ?? 'system',
        userName: user?.name ?? action.payload?.email ?? 'Anonymous',
        role: user?.role ?? 'system',
        type: action.type,
        eventId: action.payload?.eventId ?? null,
        summary: `REJECTED: ${err.message}`,
        status: 'rejected',
      },
      ...state.activityLog,
    ].slice(0, MAX_LOG);
    next.lastError = { message: err.message, ts: Date.now(), type: action.type };
    next.effects = [];
    return next;
  }
}
