import type { ChildProcess } from 'node:child_process'

/**
 * Kill an entire process tree.
 *
 * On POSIX, we spawn with `detached: true` which puts the child in its own
 * process group. Killing `-child.pid` sends the signal to every process in
 * that group.
 *
 * On Windows there is no process-group kill, so we fall back to `child.kill`.
 */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  if (process.platform === 'win32') {
    return child.kill(signal)
  }
  try {
    return process.kill(-child.pid!, signal)
  } catch {
    // Process group may already be gone
    return child.kill(signal)
  }
}
