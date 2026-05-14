import type { RpcRequest, RpcResponse } from '@glm/shared'
import type { Socket } from 'node:net'

export type RpcHandler = (params: unknown, ctx: RpcContext) => Promise<unknown>

export interface RpcContext {
  clientId: string
  sessionId?: string
  log: import('../log.js').Logger
  socket?: Socket
}

export const RPC_ERRORS = {
  PARSE_ERROR:      { code: -32700, message: 'Parse error' },
  INVALID_REQUEST:  { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS:   { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR:   { code: -32603, message: 'Internal error' }
} as const

export type { RpcRequest, RpcResponse }
