import type { Socket } from 'node:net'
import type { StreamEvent } from '../stream/sse.js'

/**
 * Push an LLM stream event to a connected client as a JSON-RPC notification.
 * The streamId lets the client multiplex concurrent llm.call streams.
 */
export function pushLlmEvent(socket: Socket, streamId: string, event: StreamEvent): void {
  const frame = {
    jsonrpc: '2.0',
    method: 'llm.events',
    params: { streamId, event }
  }
  socket.write(JSON.stringify(frame) + '\n')
}
