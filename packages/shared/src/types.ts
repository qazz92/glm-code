export type SessionId = string  // ULID
export type WorkerId = string

export interface RpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: unknown
}

export interface RpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}
