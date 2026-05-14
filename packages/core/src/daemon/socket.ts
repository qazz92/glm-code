import { createServer, type Server, type Socket } from 'node:net'
import { unlinkSync, existsSync, chmodSync } from 'node:fs'
import type { Logger } from '../log.js'

export interface SocketServerOpts {
  path: string
  log: Logger
  onConnection: (sock: Socket) => void
}

export function createSocketServer(opts: SocketServerOpts): Server {
  if (existsSync(opts.path)) {
    try { unlinkSync(opts.path) } catch { /* ignore */ }
  }
  const server = createServer((sock) => {
    sock.setNoDelay(true)
    opts.onConnection(sock)
  })
  server.on('error', (e) => opts.log.error({ err: e }, 'socket server error'))
  server.listen(opts.path, () => {
    try { chmodSync(opts.path, 0o600) } catch { /* may be unsupported on tmpfs */ }
    opts.log.info({ path: opts.path }, 'socket listening')
  })
  return server
}

export function closeSocketServer(server: Server, path: string): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      try { unlinkSync(path) } catch { /* ignore */ }
      resolve()
    })
  })
}
