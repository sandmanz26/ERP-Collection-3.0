// Planning workspace: sub-events, tasks, forms, design, documents, decisions, messages.
import { addDays, diffDays } from '../../lib/dates.js';
import { generateTasks } from '../../lib/tasks.js';
import { assert } from './common.js';
import { guaranteeCheck } from '../../lib/obligations.js';

export const planningHandlers = {
  /** Audit entry for generated/printed documents (invoice, proposal, badges, call sheet…). */
  DOCUMENT_GENERATED(ctx, { eventId, kind, ref }) {
    const ev = ctx.ev(eventId);
    return { summary: `${kind} generated for print/PDF${ref ? ` (${ref})` : ''} — ${ev.name}`, eventId };
  },
  SUBEVENT_ADD(ctx, { eventId, data }) {
    const ev = ctx.ev(eventId);
    ev.subEvents.push({ id: ctx.id('se'), date: ev.date, guestCount: ev.guestCount, start: '18:00', end: '22:00', venue: ev.venue?.name, room: '', ...data });
    return { summary: `Added function "${data.name}" to ${ev.name}`, eventId };
  },
  SUBEVENT_UPDATE(ctx, { eventId, subEventId, patch }) {
    const ev = ctx.ev(eventId);
    const s = ev.subEvents.find((x) => x.id === subEventId);
    Object.assign(s, patch);
    return { summary: `Updated function "${s.name}" (${Object.keys(patch).join(', ')})`, eventId };
  },
  SUBEVENT_REMOVE(ctx, { eventId, subEventId }) {
    const ev = ctx.ev(eventId);
    const s = ev.subEvents.find((x) => x.id === subEventId);
    ev.subEvents = ev.subEvents.filter((x) => x.id !== subEventId);
    return { summary: `Removed function "${s.name}"`, eventId };
  },
  TASKS_GENERATE(ctx, { eventId }) {
    const ev = ctx.ev(eventId);
    assert(ev.date, 'Event date required');
    const et = ctx.state.settings.eventTypes.find((t) => t.id === ev.eventTypeId);
    const created = generateTasks(et.taskTemplate, ev.date, ctx.id).filter((t) => !ev.tasks.some((x) => x.title === t.title));
    ev.tasks.push(...created);
    return { summary: `Generated ${created.length} tasks from "${et.name}" template (relative to event date)`, eventId };
  },
  TASK_ADD(ctx, { eventId, data }) {
    const ev = ctx.ev(eventId);
    const offsetDays = data.dueDate && ev.date ? diffDays(ev.date, data.dueDate) : null;
    ev.tasks.push({ id: ctx.id('task'), status: 'todo', priority: 'medium', assigneeType: 'staff', assigneeId: null, dependsOn: [], category: 'general', fixedDue: false, offsetDays, ...data });
    return { summary: `Task added: "${data.title}" (due ${data.dueDate}${offsetDays !== null ? `, T${offsetDays >= 0 ? '+' : ''}${offsetDays}` : ''})`, eventId };
  },
  TASK_UPDATE(ctx, { eventId, taskId, patch }) {
    const ev = ctx.ev(eventId);
    const t = ev.tasks.find((x) => x.id === taskId);
    if (patch.status === 'done') {
      const blocking = t.dependsOn.map((id) => ev.tasks.find((x) => x.id === id)).filter((x) => x && x.status !== 'done');
      assert(!blocking.length, `Blocked by: ${blocking.map((b) => b.title).join(', ')}`);
    }
    if (patch.dueDate && ev.date) {
      patch.offsetDays = diffDays(ev.date, patch.dueDate);
    }
    Object.assign(t, patch);
    return { summary: `Task "${t.title}" → ${Object.entries(patch).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : v}`).join(', ')}`, eventId };
  },
  TASK_REMOVE(ctx, { eventId, taskId }) {
    const ev = ctx.ev(eventId);
    const t = ev.tasks.find((x) => x.id === taskId);
    ev.tasks = ev.tasks.filter((x) => x.id !== taskId).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== taskId) }));
    return { summary: `Task removed: "${t.title}"`, eventId };
  },
  FORM_SAVE(ctx, { eventId, formId, answers, submit }) {
    const ev = ctx.ev(eventId);
    const f = ev.forms.find((x) => x.id === formId);
    f.answers = { ...f.answers, ...answers };
    if (submit) f.submittedAt = new Date().toISOString();
    if (submit) ctx.notify({ toRoles: ['planner'], eventId, level: 'info', text: `${ev.name}: client submitted "${f.name}" form.` });
    return { summary: `Planning form "${f.name}" ${submit ? 'submitted' : 'saved'} by ${ctx.user.name}`, eventId };
  },
  DESIGN_UPDATE(ctx, { eventId, patch }) {
    const ev = ctx.ev(eventId);
    Object.assign(ev.design, patch);
    return { summary: `Design board updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  DOCUMENT_ADD(ctx, { eventId, name, type, expiresAt }) {
    const ev = ctx.ev(eventId);
    ev.documents.unshift({ id: ctx.id('doc'), name, type, uploadedBy: ctx.user.id, at: new Date().toISOString(), expiresAt: expiresAt || null });
    return { summary: `Document uploaded: ${name} (${type})`, eventId };
  },
  DECISION_ADD(ctx, { eventId, decision, decidedBy, reference }) {
    const ev = ctx.ev(eventId);
    ev.decisions.unshift({ id: ctx.id('dec'), decision, decidedBy, approvedAt: new Date().toISOString(), recordedBy: ctx.user.id, reference });
    return { summary: `Decision logged: "${decision}" approved by ${decidedBy}`, eventId };
  },
  MESSAGE_SEND(ctx, { eventId, text }) {
    const ev = ctx.ev(eventId);
    ev.messages.push({ id: ctx.id('msg'), from: ctx.user.id, text, at: new Date().toISOString() });
    ctx.notify({ toRoles: ctx.user.role === 'client' ? ['planner'] : [], toUserIds: ctx.user.role === 'client' ? [ev.plannerId] : [], eventId, level: 'info', text: `New message on ${ev.name} from ${ctx.user.name}` });
    return { summary: `Message on ${ev.name} from ${ctx.user.name}`, eventId };
  },
  PAYER_UPDATE(ctx, { eventId, payers }) {
    const ev = ctx.ev(eventId);
    ev.payers = payers;
    return { summary: `Payer split updated (${payers.map((p) => `${p.name}: ${p.categories.join('/') || 'all'}`).join('; ')})`, eventId };
  },
  CLIENT_BUDGET_SET(ctx, { eventId, category, amount }) {
    const ev = ctx.ev(eventId);
    ev.clientBudget[category] = Number(amount) || 0;
    return { summary: `Client budget ${category} = ${amount}`, eventId };
  },
  APPROVAL_STEP(ctx, { eventId, stepId, status }) {
    const ev = ctx.ev(eventId);
    const s = ev.approvals.find((x) => x.id === stepId);
    s.status = status;
    s.at = new Date().toISOString();
    s.by = s.by || ctx.user.name;
    return { summary: `Client approval step "${s.step}" → ${status}`, eventId };
  },
  APPROVAL_ADD(ctx, { eventId, step }) {
    const ev = ctx.ev(eventId);
    ev.approvals.push({ id: ctx.id('apr'), step, by: '', at: null, status: 'pending' });
    return { summary: `Client approval step added: ${step}`, eventId };
  },
  FINAL_HEADCOUNT_SET(ctx, { eventId, count, acknowledgeShortfall, override }) {
    const ev = ctx.ev(eventId);
    const deadline = addDays(ev.date, -ctx.state.settings.finalHeadcountDays);
    assert(ctx.today <= deadline || ctx.user.role === 'admin' || ev.finalHeadcount === null, `Final headcount deadline (${deadline}) passed — use a Change Order (exception) to change the count.`);
    const prev = ev.finalHeadcount;
    const n = Number(count);
    assert(Number.isInteger(n) && n > 0, 'Headcount must be a whole number above 0');
    const cap = Number(ev.venue?.capacity) || 0;
    assert(!cap || n <= cap, `${n} guests exceeds the venue's licensed capacity of ${cap}`);
    const g = guaranteeCheck(ctx.state, ev, n);
    // after the guarantee date the count may only go up (beyond a small tolerance) — venues bill the guarantee
    if (prev && ctx.today > deadline && g.reductionFloor && n < g.reductionFloor) assert(override && override.trim(), `After the guarantee date the count can drop at most ${g.reductionPct}% (to ${g.reductionFloor}). Record the venue's written agreement as the override reason.`);
    assert(!g.shortfalls.length || acknowledgeShortfall, `Below the minimum guarantee: ${g.shortfalls.map((s) => `${s.category} ${s.min}`).join(', ')} — you will be billed for the minimum. Confirm to continue.`);
    ev.finalHeadcount = n;
    ev.decisions.unshift({ id: ctx.id('dec'), decision: `Final headcount confirmed: ${count}${prev ? ` (was ${prev})` : ''}${g.shortfalls.length ? ` — below guarantee, billed at ${g.shortfalls.map((s) => `${s.category} ${s.min}`).join(', ')}` : ''}${override ? ` — override: ${override}` : ''}`, decidedBy: ctx.user.name, approvedAt: new Date().toISOString(), recordedBy: ctx.user.id, reference: 'Final headcount' });
    return { summary: `Final headcount set to ${count} for ${ev.name}`, eventId };
  },
};
