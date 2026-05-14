import { createConnection, type Socket } from 'node:net'
import { resolvePaths } from '@glm/shared'

export class RpcClient {
  private socket?: Socket
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private leftover = ''

  async connect(): Promise<void> {
    const paths = resolvePaths()
    await new Promise<void>((resolve, reject) => {
      const s = createConnection(paths.socket, () => resolve())
      s.on('error', reject)
      s.on('data', (chunk) => this.onData(chunk))
      s.on('close', () => {
        for (const { reject } of this.pending.values()) reject(new Error('connection closed'))
        this.pending.clear()
      })
      this.socket = s
    })
  }

  private onData(chunk: Buffer): void {
    const combined = this.leftover + chunk.toString('utf8')
    const parts = combined.split('\n')
    this.leftover = parts.pop() ?? ''
    for (const f of parts.filter(Boolean)) {
      const msg = JSON.parse(f) as { id: number; result?: unknown; error?: { code: number; message: string } }
      const p = this.pending.get(msg.id)
      if (!p) continue
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`))
      else p.resolve(msg.result)
    }
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.socket) throw new Error('not connected')
    const id = this.nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.socket!.write(frame)
    })
  }

  close(): void { this.socket?.end() }
}
