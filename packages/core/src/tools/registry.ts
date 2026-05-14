import { z } from 'zod'
import { toolOk, toolErr, type ToolResult } from './errors.js'
import type { ToolContext } from './context.js'

export interface ToolHandler {
  name: string
  description: string
  schema: z.ZodType
  run(params: unknown, ctx: ToolContext): Promise<unknown>
}

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>()

  register(handler: ToolHandler): void {
    if (this.tools.has(handler.name)) throw new Error(`Tool '${handler.name}' already registered`)
    this.tools.set(handler.name, handler)
  }

  unregister(name: string): void { this.tools.delete(name) }

  get(name: string): ToolHandler | undefined { return this.tools.get(name) }

  has(name: string): boolean { return this.tools.has(name) }

  list(): Array<{ name: string; description: string }> {
    return [...this.tools.values()].map(t => ({ name: t.name, description: t.description }))
  }

  async call(name: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const handler = this.tools.get(name)
    if (!handler) return toolErr('NOT_FOUND', `Tool '${name}' not found`)
    const parsed = handler.schema.safeParse(params)
    if (!parsed.success) return toolErr('VALIDATION_ERROR', parsed.error.message)
    try {
      const data = await handler.run(parsed.data, ctx)
      return toolOk(data)
    } catch (e) {
      return toolErr('RUNTIME_ERROR', (e as Error).message)
    }
  }
}
