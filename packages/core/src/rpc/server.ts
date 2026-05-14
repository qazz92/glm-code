import type { Socket } from 'node:net'
import type { Logger } from '../log.js'
import type { RpcHandler, RpcContext } from './protocol.js'
import { RPC_ERRORS, type RpcRequest, type RpcResponse } from './protocol.js'

export function framesFromChunk(chunk: Buffer, leftover: string): { frames: string[]; leftover: string } {
  const combined = leftover + chunk.toString('utf8')
  const parts = combined.split('\n')
  const next = parts.pop() ?? ''
  return { frames: parts.filter(Boolean), leftover: next }
}

export class RpcServer {
  private handlers = new Map<string, RpcHandler>()
  constructor(private log: Logger) {}

  on(method: string, h: RpcHandler): void { this.handlers.set(method, h) }

  attach(socket: Socket, ctx: Omit<RpcContext, 'log'>): void {
    let leftover = ''
    const fullCtx: RpcContext = { ...ctx, log: this.log }
    socket.on('data', async (chunk) => {
      const { frames, leftover: lo } = framesFromChunk(chunk, leftover)
      leftover = lo
      for (const f of frames) await this.handleFrame(f, socket, fullCtx)
    })
    socket.on('error', (e) => this.log.warn({ err: e, clientId: ctx.clientId }, 'rpc socket error'))
  }

  private async handleFrame(frame: string, socket: Socket, ctx: RpcContext): Promise<void> {
    let req: RpcRequest
    try { req = JSON.parse(frame) as RpcRequest } catch {
      return this.send(socket, { jsonrpc: '2.0', id: null, error: RPC_ERRORS.PARSE_ERROR })
    }
    if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
      return this.send(socket, { jsonrpc: '2.0', id: req.id ?? null, error: RPC_ERRORS.INVALID_REQUEST })
    }
    const h = this.handlers.get(req.method)
    if (!h) {
      return this.send(socket, { jsonrpc: '2.0', id: req.id, error: RPC_ERRORS.METHOD_NOT_FOUND })
    }
    try {
      const result = await h(req.params, ctx)
      this.send(socket, { jsonrpc: '2.0', id: req.id, result })
    } catch (e) {
      this.log.error({ err: e, method: req.method }, 'rpc handler error')
      this.send(socket, { jsonrpc: '2.0', id: req.id, error: { code: RPC_ERRORS.INTERNAL_ERROR.code, message: (e as Error).message } })
    }
  }

  private send(socket: Socket, res: RpcResponse): void {
    socket.write(JSON.stringify(res) + '\n')
  }
}
