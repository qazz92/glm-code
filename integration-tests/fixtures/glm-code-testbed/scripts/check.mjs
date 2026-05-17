import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status}`,
    );
  }
}

run('npm', ['run', 'lint', '--silent']);
run('npm', ['test', '--silent']);

const python = spawnSync('python3', ['--version'], { stdio: 'ignore' });
if (python.status === 0) {
  run('python3', ['-m', 'unittest', 'discover', '-s', 'py/tests'], {
    env: {
      ...process.env,
      PYTHONPATH: 'py',
    },
  });
} else {
  console.log('python3 not found; skipping Python checks');
}

console.log('check ok');
