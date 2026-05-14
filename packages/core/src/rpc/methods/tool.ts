import { z } from 'zod'
import type { RpcHandler } from '../protocol.js'
import { RPC_ERRORS } from '../protocol.js'
import type { ToolRegistry } from '../../tools/registry.js'
import type { ToolContext } from '../../tools/context.js'
import { makeNullContext } from '../../tools/context.js'
import { checkPermission } from '../../tools/permission.js'

const ToolNameSchema = z.object({ name: z.string().min(1) })
const ToolCallSchema = z.object({
  name: z.string().min(1),
  params: z.unknown(),
  sessionId: z.string().optional(),
})

export interface ToolMethodDeps {
  registry: ToolRegistry
}

export function makeToolMethods(deps: ToolMethodDeps): Record<string, RpcHandler> {
  return {
    'tool.list': async () => {
      return deps.registry.list()
    },

    'tool.call': async (p) => {
      const parsed = ToolCallSchema.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }

      const { name, params, sessionId } = parsed.data

      // Permission check
      if (!checkPermission(name, (params ?? {}) as Record<string, unknown>)) {
        throw { ...RPC_ERRORS.INVALID_PARAMS, message: 'Permission denied for tool' }
      }

      const ctx: ToolContext = {
        ...makeNullContext(),
        sessionId,
      }

      const result = await deps.registry.call(name, params, ctx)
      return result
    },
  }
}
