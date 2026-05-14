import { z } from 'zod'
import type { RpcHandler } from '../protocol.js'
import { RPC_ERRORS } from '../protocol.js'

const SendParams = z.object({ sessionId: z.string(), text: z.string() })

export const messageSendStub: RpcHandler = async (p) => {
  const parsed = SendParams.safeParse(p)
  if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
  return {
    sessionId: parsed.data.sessionId,
    role: 'assistant',
    content: parsed.data.text,
    model: 'stub-echo',
    ts: new Date().toISOString()
  }
}
