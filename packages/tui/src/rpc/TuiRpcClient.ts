import { createConnection, type Socket } from 'node:net'
import { resolvePaths } from '@glm/shared'

export type NotificationHandler = (params: unknown) => void

export interface TuiRpcClientOpts {
  /** Pre-built socket for tests; if absent connect() must be called. */
  socket?: Socket
  /** Override socket path; defaults to resolvePaths().socket */
  socketPath?: string
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

export class TuiRpcClient {
  private socket?: Socket
  private socketPath: string
  private nextId = 1
  private pending = new Map<number, Pending>()
  private subs = new Map<string, Set<NotificationHandler>>()
  private leftover = ''
  private closed = false

  constructor(opts: TuiRpcClientOpts = {}) {
    this.socketPath = opts.socketPath ?? resolvePaths().socket
    if (opts.socket) this.attach(opts.socket)
  }

  async connect(): Promise<void> {
    if (this.socket) return
    await new Promise<void>((resolve, reject) => {
      const s = createConnection(this.socketPath, () => resolve())
      s.once('error', reject)
      this.attach(s)
    })
  }

  private attach(socket: Socket): void {
    this.socket = socket
    socket.on('data', (chunk: Buffer) => this.onData(chunk))
    socket.on('close', () => this.onClose())
    socket.on('error', () => { /* handled by per-call rejection */ })
  }

  private onData(chunk: Buffer): void {
    this.leftover += chunk.toString('utf8')
    const parts = this.leftover.split('\n')
    this.leftover = parts.pop() ?? ''
    for (const frame of parts.filter(Boolean)) this.handleFrame(frame)
  }

  private handleFrame(frame: string): void {
    let msg: { id?: number | string | null; method?: string; result?: unknown; error?: { code: number; message: string }; params?: unknown }
    try { msg = JSON.parse(frame) } catch { return }
    // Notification (no id, has method) — subscribe path
    if (msg.method && (msg.id === undefined || msg.id === null)) {
      const subs = this.subs.get(msg.method)
      if (subs) for (const fn of subs) fn(msg.params)
      return
    }
    // Response (has id)
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`))
      else p.resolve(msg.result)
    }
  }

  private onClose(): void {
    this.closed = true
    for (const { reject } of this.pending.values()) reject(new Error('connection closed'))
    this.pending.clear()
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error('client closed'))
    if (!this.socket) return Promise.reject(new Error('not connected'))
    const id = this.nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.socket!.write(frame)
    })
  }

  subscribe(method: string, handler: NotificationHandler): () => void {
    if (!this.subs.has(method)) this.subs.set(method, new Set())
    const set = this.subs.get(method)!
    set.add(handler)
    return () => set.delete(handler)
  }

  close(): void {
    if (this.closed) return
    this.socket?.end()
  }

  get connected(): boolean { return !!this.socket && !this.closed }
}
