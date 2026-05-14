export { ToolRegistry } from './registry.js'
export type { ToolHandler } from './registry.js'
export type { ToolContext } from './context.js'
export { makeNullContext } from './context.js'
export { checkPermission, type PermissionSettings } from './permission.js'
export { toolOk, toolErr, type ToolResult, type ToolError, type ToolErrorCode } from './errors.js'

// Tool implementations
export { readTool } from './read/tool.js'
export { writeTool } from './write/tool.js'
export { editTool } from './edit/tool.js'
export { grepTool } from './grep/tool.js'
export { globTool } from './glob/tool.js'
export { bashTool } from './bash/tool.js'
export { todoWriteTool } from './todo/tool.js'
export { taskTool } from './task/tool.js'

import { ToolRegistry } from './registry.js'
import type { ToolHandler } from './registry.js'
import { readTool } from './read/tool.js'
import { writeTool } from './write/tool.js'
import { editTool } from './edit/tool.js'
import { grepTool } from './grep/tool.js'
import { globTool } from './glob/tool.js'
import { bashTool } from './bash/tool.js'
import { todoWriteTool } from './todo/tool.js'
import { taskTool } from './task/tool.js'
import { LoaderHub } from '../daemon/loader-hub.js'
import { makeToolMethods } from '../rpc/methods/tool.js'

const ALL_TOOLS: ToolHandler[] = [
  readTool,
  writeTool,
  editTool,
  grepTool,
  globTool,
  bashTool,
  todoWriteTool,
  taskTool,
]

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  for (const tool of ALL_TOOLS) registry.register(tool)
  return registry
}

LoaderHub.registerSubsystem('tools', (daemon) => {
  const registry = createDefaultToolRegistry()
  const methods = makeToolMethods({ registry })
  for (const [name, handler] of Object.entries(methods)) {
    daemon.registerRpc(name, handler)
  }
})
