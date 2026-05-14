import { createServer, type Server } from 'node:http'
import { anthropicCannedStream } from './anthropic-stream.js'
import { openaiCannedStream } from './openai-stream.js'

export interface MockOpts {
  port?: number
  failNTimesWith?: { count: number; status: number; body?: string; headers?: Record<string, string> }
  anthropicSequence?: 'text' | 'tool_use' | 'with_thinking'
  openaiSequence?: 'text' | 'tool_use'
}

export interface MockHandle {
  server: Server
  port: number
  baseUrl: string
  failuresLeft: number
  requestsReceived: number
  close: () => Promise<void>
}

export function startMockZai(opts: MockOpts = {}): Promise<MockHandle> {
  let failuresLeft = opts.failNTimesWith?.count ?? 0
  let requestsReceived = 0

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      requestsReceived++
      const url = req.url ?? ''

      if (failuresLeft > 0) {
        failuresLeft--
        const f = opts.failNTimesWith!
        res.writeHead(f.status, f.headers ?? {})
        res.end(f.body ?? `error ${f.status}`)
        return
      }

      if (url.startsWith('/api/anthropic/v1/messages')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'anthropic-ratelimit-requests-limit': '15000',
          'anthropic-ratelimit-requests-remaining': '14999',
          'anthropic-ratelimit-requests-reset': new Date(Date.now() + 3600_000).toISOString(),
        })
        for (const frame of anthropicCannedStream(opts.anthropicSequence ?? 'text')) res.write(frame)
        res.end()
        return
      }

      if (url.startsWith('/api/coding/v1/chat/completions')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'x-ratelimit-limit-requests': '15000',
          'x-ratelimit-remaining-requests': '14999',
        })
        for (const frame of openaiCannedStream(opts.openaiSequence ?? 'text')) res.write(frame)
        res.end()
        return
      }

      res.writeHead(404)
      res.end('not found')
    })

    server.listen(opts.port ?? 0, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') throw new Error('no server address')
      const port = addr.port
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        get failuresLeft() { return failuresLeft },
        get requestsReceived() { return requestsReceived },
        close: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
  })
}
