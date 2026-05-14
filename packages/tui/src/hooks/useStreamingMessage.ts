import { useEffect } from 'react'
import type { TuiRpcClient } from '../rpc/TuiRpcClient.js'
import type { ChatLog } from '../state/chatLog.js'

export interface DeltaPayload {
  messageId: string
  chunk?: string
  done?: boolean
}

/**
 * Subscribe to the daemon's `message.delta` notifications and pipe chunks
 * into the chatLog. P1 stub doesn't emit these, but the subscription is harmless
 * and becomes live when P6 ships streaming.
 */
export function useStreamingMessage(rpc: TuiRpcClient, log: ChatLog): void {
  useEffect(() => {
    const off = rpc.subscribe('message.delta', (raw) => {
      const d = raw as DeltaPayload
      if (!d || !d.messageId) return
      if (d.chunk) log.appendStreamChunk(d.messageId, d.chunk)
      if (d.done) log.endStream(d.messageId)
    })
    return () => { off() }
  }, [rpc, log])
}
