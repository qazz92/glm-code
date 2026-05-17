import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ignoredDirs = new Set(['.git', 'node_modules', 'build', 'secrets']);
const checkedExtensions = new Set(['.js', '.mjs', '.json', '.md', '.py']);
const failures = [];

function extensionOf(path) {
  const match = path.match(/\.[^.]+$/);
  return match ? match[0] : '';
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!checkedExtensions.has(extensionOf(path))) continue;
    const content = readFileSync(path, 'utf8');
    const rel = relative(root, path);
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (/\s+$/.test(line))
        failures.push(`${rel}:${index + 1} trailing whitespace`);
      if (line.includes('\t'))
        failures.push(`${rel}:${index + 1} tab character`);
    });
  }
}

walk(root);

const readme = readFileSync(join(root, 'README.md'), 'utf8');
if (!readme.includes('GLM Code')) {
  failures.push('README.md must mention GLM Code');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('lint ok');
