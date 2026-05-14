import { z } from 'zod'
import type { RpcHandler } from '../protocol.js'
import { RPC_ERRORS } from '../protocol.js'
import type { SessionRepo } from '../../storage/session-repo.js'

const CreateParams = z.object({ cwd: z.string(), worktree: z.string().optional(), initialTask: z.string().optional() })
const IdParams = z.object({ sessionId: z.string() })
const ListParams = z.object({ limit: z.number().int().positive().max(500).optional(), activeOnly: z.boolean().optional() }).optional()

export function makeSessionHandlers(repo: SessionRepo): Record<string, RpcHandler> {
  return {
    'session.create': async (p) => {
      const parsed = CreateParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      const s = repo.create({ cwd: parsed.data.cwd, worktree: parsed.data.worktree ?? parsed.data.cwd, initialTask: parsed.data.initialTask })
      return s
    },
    'session.get': async (p) => {
      const parsed = IdParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      return repo.get(parsed.data.sessionId)
    },
    'session.list': async (p) => {
      const parsed = ListParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      return repo.list(parsed.data ?? {})
    },
    'session.touch': async (p) => {
      const parsed = IdParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      repo.touch(parsed.data.sessionId)
      return { ok: true }
    },
    'session.markInactive': async (p) => {
      const parsed = IdParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      repo.markInactive(parsed.data.sessionId)
      return { ok: true }
    }
  }
}
