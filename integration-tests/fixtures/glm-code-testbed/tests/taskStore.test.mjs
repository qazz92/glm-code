import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeTask,
  createTask,
  normalizeTitle,
  searchTasks,
  summarizeTasks,
} from '../src/taskStore.mjs';

test('normalizeTitle trims and squashes whitespace', () => {
  assert.equal(normalizeTitle('  Ship   GLM   Code  '), 'Ship GLM Code');
});

test('createTask creates deterministic task ids', () => {
  assert.deepEqual(createTask('Ship GLM Code', { tags: ['release'] }), {
    id: 'task-ship-glm-code',
    title: 'Ship GLM Code',
    status: 'open',
    tags: ['release'],
  });
});

test('completeTask returns a completed copy', () => {
  const task = createTask('Write tests');
  assert.equal(completeTask(task).status, 'done');
  assert.equal(task.status, 'open');
});

test('summarizeTasks counts open and done work', () => {
  const tasks = [createTask('A'), completeTask(createTask('B'))];
  assert.deepEqual(summarizeTasks(tasks), { total: 2, open: 1, done: 1 });
});

test('searchTasks searches titles, status, and tags', () => {
  const tasks = [
    createTask('Add MCP tool', { tags: ['integration'] }),
    completeTask(createTask('Polish docs', { tags: ['docs'] })),
  ];
  assert.equal(searchTasks(tasks, 'integration').length, 1);
  assert.equal(searchTasks(tasks, 'done').length, 1);
  assert.equal(searchTasks(tasks, '').length, 2);
});
