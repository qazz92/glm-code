/**
 * Bash tool — spawn a child process, capture output, enforce timeout.
 */

import { z } from 'zod'
import { spawn, type ChildProcess } from 'node:child_process'
import type { ToolHandler } from '../registry.js'
import { killTree } from './kill-tree.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024 // 2 MiB
const KILL_GRACE_MS = 5_000

const BashSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  env: z.record(z.string()).optional(),
  shell: z.boolean().optional().default(true),
  maxOutputBytes: z.number().int().positive().optional(),
})

function appendCapped(buffer: string, chunk: string, maxBytes: number): { result: string; truncated: boolean } {
  const total = Buffer.byteLength(buffer + chunk, 'utf8')
  if (total <= maxBytes) return { result: buffer + chunk, truncated: false }
  // Truncate chunk to fit — slice by character count to stay within byte budget
  const budget = maxBytes - Buffer.byteLength(buffer, 'utf8')
  if (budget <= 0) return { result: buffer, truncated: true }
  // Binary search for the longest prefix that fits
  let lo = 0, hi = chunk.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (Buffer.byteLength(chunk.slice(0, mid), 'utf8') <= budget) lo = mid
    else hi = mid - 1
  }
  return { result: buffer + chunk.slice(0, lo), truncated: true }
}

export const bashTool: ToolHandler = {
  name: 'bash',
  description: 'Run a shell command, capture stdout/stderr, enforce timeout',
  schema: BashSchema,
  async run(params, ctx) {
    const {
      command,
      cwd,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      env,
      shell = true,
      maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    } = BashSchema.parse(params)

    const workDir = cwd ?? ctx.cwd
    const start = Date.now()

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let truncated = false
      let settled = false
      let killTimer: ReturnType<typeof setTimeout> | undefined
      let child: ChildProcess

      const isPosix = process.platform !== 'win32'
      const childEnv = { ...process.env, ...env }

      try {
        child = spawn(command, [], {
          cwd: workDir,
          env: childEnv,
          shell,
          detached: isPosix,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (e) {
        return reject(new Error(`Failed to spawn: ${(e as Error).message}`))
      }

      const finalize = (exitCode: number | null, signal: string | null) => {
        if (settled) return
        settled = true
        if (killTimer !== undefined) clearTimeout(killTimer)

        resolve({
          exitCode: exitCode ?? -1,
          signal: signal ?? null,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          truncated,
        })
      }

      const handleTimeout = () => {
        if (settled) return
        settled = true

        try { killTree(child, 'SIGTERM') } catch { /* best effort */ }

        killTimer = setTimeout(() => {
          try { killTree(child, 'SIGKILL') } catch { /* best effort */ }
        }, KILL_GRACE_MS)

        reject(new Error(`Command timed out after ${timeoutMs}ms`))
      }

      const timeoutTimer = setTimeout(handleTimeout, timeoutMs)

      child.stdout!.on('data', (chunk: Buffer) => {
        const s = chunk.toString('utf8')
        const r = appendCapped(stdout, s, maxOutputBytes)
        if (r.truncated) truncated = true
        if (r.result !== stdout) ctx.emit('stdout', { data: r.result.slice(stdout.length) })
        stdout = r.result
      })

      child.stderr!.on('data', (chunk: Buffer) => {
        const s = chunk.toString('utf8')
        const r = appendCapped(stderr, s, maxOutputBytes)
        if (r.truncated) truncated = true
        stderr = r.result
      })

      child.on('close', (code, sig) => {
        clearTimeout(timeoutTimer)
        finalize(code, sig)
      })

      child.on('error', (err) => {
        clearTimeout(timeoutTimer)
        if (!settled) {
          settled = true
          reject(new Error(`Spawn error: ${err.message}`))
        }
      })
    })
  },
}
