// Task template engine: tasks scheduled relative to event date (T-minus offsets).
import { addDays } from './dates.js';

export function generateTasks(template, eventDate, idFn) {
  const idMap = {};
  template.forEach((t) => (idMap[t.key] = idFn('task')));
  return template.map((t) => ({
    id: idMap[t.key],
    title: t.title,
    offsetDays: t.offsetDays,
    dueDate: addDays(eventDate, t.offsetDays),
    fixedDue: false,
    assigneeType: t.assigneeType ?? 'staff',
    assigneeId: null,
    status: 'todo',
    priority: t.priority ?? 'medium',
    dependsOn: (t.dependsOn ?? []).map((k) => idMap[k]).filter(Boolean),
    category: t.category ?? 'general',
  }));
}

/** When an event date moves, every relative task shifts. Tasks with manual (fixed) due dates stay. */
export function shiftTasks(tasks, newDate) {
  return tasks.map((t) => (t.fixedDue || t.offsetDays === null || t.offsetDays === undefined ? t : { ...t, dueDate: addDays(newDate, t.offsetDays) }));
}

export function taskBlocked(task, tasks) {
  return task.dependsOn.some((id) => tasks.find((t) => t.id === id)?.status !== 'done');
}
