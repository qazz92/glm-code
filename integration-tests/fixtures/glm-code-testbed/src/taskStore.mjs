/**
 * Tiny task domain used by GLM Code dogfood scenarios.
 */

export function normalizeTitle(title) {
  return String(title).trim().replace(/\s+/g, ' ');
}

export function createTask(title, options = {}) {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) {
    throw new Error('Task title is required.');
  }

  return {
    id:
      options.id ??
      `task-${normalizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: normalizedTitle,
    status: options.status ?? 'open',
    tags: Array.isArray(options.tags) ? [...options.tags] : [],
  };
}

export function completeTask(task) {
  return { ...task, status: 'done' };
}

export function summarizeTasks(tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const open = total - done;
  return { total, open, done };
}

export function searchTasks(tasks, query) {
  const needle = String(query).trim().toLowerCase();
  if (!needle) return tasks;
  return tasks.filter((task) => {
    const haystack = [task.title, task.status, ...(task.tags ?? [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
