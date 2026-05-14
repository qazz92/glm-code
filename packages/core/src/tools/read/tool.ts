/**
 * Read tool — wraps the URL router as a ToolHandler.
 *
 * Uses a global symbol to store the singleton UrlRouter, so that
 * multiple registrations (e.g. during tests) share the same instance.
 */

import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { makeUrlRouter, type UrlRouter } from './url-router.js'
import { localHandler } from './schemes/local.js'
import { issueHandler } from './schemes/issue.js'
import { prHandler } from './schemes/pr.js'
import { memoryHandler } from './schemes/memory.js'
import { mcpHandler } from './schemes/mcp.js'
import { skillHandler } from './schemes/skill.js'
import { ruleHandler } from './schemes/rule.js'
import { agentHandler } from './schemes/agent.js'
import { artifactHandler } from './schemes/artifact.js'
import { conflictHandler } from './schemes/conflict.js'

const ROUTER_SYMBOL = Symbol.for('@glm/core/tools/read/router')

/** Get or create the singleton UrlRouter with all built-in handlers. */
export function getRouter(): UrlRouter {
  const g = globalThis as Record<symbol, unknown>
  if (!g[ROUTER_SYMBOL]) {
    const router = makeUrlRouter()
    router.register('file', localHandler)
    router.register('issue', issueHandler)
    router.register('pr', prHandler)
    router.register('memory', memoryHandler)
    router.register('mcp', mcpHandler)
    router.register('skill', skillHandler)
    router.register('rule', ruleHandler)
    router.register('agent', agentHandler)
    router.register('artifact', artifactHandler)
    router.register('conflict', conflictHandler)
    g[ROUTER_SYMBOL] = router
  }
  return g[ROUTER_SYMBOL] as UrlRouter
}

/** Reset the singleton router (for tests). */
export function resetRouter(): void {
  const g = globalThis as Record<symbol, unknown>
  delete g[ROUTER_SYMBOL]
}

const ReadSchema = z.object({
  path: z.string().min(1),
})

export const readTool: ToolHandler = {
  name: 'read',
  description: 'Read file or URL-like resource with optional line selector',
  schema: ReadSchema,
  async run(params: unknown) {
    const { path } = ReadSchema.parse(params)
    const result = await getRouter().read(path)
    if (!result.ok) throw new Error(result.error?.message ?? 'Read failed')
    return result.data
  },
}
