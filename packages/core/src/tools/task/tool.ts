/**
 * Task tool — stub returning NOT_IMPLEMENTED.
 *
 * Task delegation is a complex feature that will be implemented in a later phase.
 */

import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { toolErr } from '../errors.js'

const TaskSchema = z.object({
  prompt: z.string().min(1),
  agent: z.string().optional(),
  files: z.array(z.string()).optional(),
})

export const taskTool: ToolHandler = {
  name: 'task',
  description: 'Delegate a task to a sub-agent (not yet implemented)',
  schema: TaskSchema,
  async run() {
    return toolErr('RUNTIME_ERROR', 'Task tool is not yet implemented')
  },
}
