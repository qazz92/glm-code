/**
 * ripgrep adapter — spawns `rg --json`, parses NDJSON output.
 * Falls back gracefully if rg is not available.
 */

import { spawn } from 'node:child_process'
import type { GrepResult, GrepMatch } from './js.js'

interface RgMessage {
  type: string
  data?: {
    path?: { text: string }
    lines?: { text: string }
    line_number?: number
    submatches?: Array<{ start: number }>
  }
}

export async function rgAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('rg', ['--version'], { stdio: 'ignore' })
    proc.on('error', () => resolve(false))
    proc.on('exit', code => resolve(code === 0))
  })
}

export async function rgGrep(opts: {
  pattern: string
  cwd: string
  include?: string[]
  exclude?: string[]
  caseInsensitive?: boolean
}): Promise<GrepResult> {
  const args: string[] = ['--json', '--no-heading']

  if (opts.caseInsensitive) args.push('-i')

  if (opts.include?.length) {
    for (const glob of opts.include) {
      args.push('--glob', glob)
    }
  }
  if (opts.exclude?.length) {
    for (const glob of opts.exclude) {
      args.push('--glob', `!${glob}`)
    }
  }

  args.push(opts.pattern, opts.cwd)

  return new Promise((resolve, reject) => {
    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', () => { /* ignore stderr */ })

    proc.on('error', err => reject(err))
    proc.on('exit', () => {
      const output = Buffer.concat(chunks).toString('utf-8')
      const matches: GrepMatch[] = []
      const MAX_MATCHES = 500
      let truncated = false

      for (const line of output.split('\n')) {
        if (!line.trim()) continue
        if (matches.length >= MAX_MATCHES) {
          truncated = true
          break
        }

        let msg: RgMessage
        try {
          msg = JSON.parse(line) as RgMessage
        } catch {
          continue
        }

        if (msg.type === 'match' && msg.data) {
          const filePath = msg.data.path?.text ?? ''
          const text = msg.data.lines?.text ?? ''
          const lineNum = msg.data.line_number ?? 0
          const col = msg.data.submatches?.[0]?.start ?? 0

          matches.push({
            file: filePath,
            line: lineNum,
            column: col + 1,
            text: text.replace(/\n$/, ''),
          })
        }
      }

      resolve({ matches, truncated })
    })
  })
}
