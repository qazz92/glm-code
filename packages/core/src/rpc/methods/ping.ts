import type { RpcHandler } from '../protocol.js'
export const pingHandler: RpcHandler = async () => ({ pong: true, ts: new Date().toISOString() })
