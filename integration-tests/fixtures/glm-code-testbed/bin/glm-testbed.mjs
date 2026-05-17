#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeTasks } from '../src/taskStore.mjs';

const dataPath = resolve('data/tasks.json');
const tasks = JSON.parse(readFileSync(dataPath, 'utf8'));
const summary = summarizeTasks(tasks);

console.log(`GLM Code testbed: ${summary.open} open / ${summary.done} done`);
