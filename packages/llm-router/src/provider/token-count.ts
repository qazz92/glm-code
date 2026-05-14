import type { IRRequest } from '../ir/types.js'

/**
 * Heuristic token estimator: ~4 characters per token.
 * Used for quota pre-flight when the exact count is unknown.
 */
export function estimateTokens(req: IRRequest): number {
  let chars = 0
  if (req.system) chars += req.system.length
  for (const m of req.messages) {
    for (const b of m.content) {
      switch (b.type) {
        case 'text': chars += b.text.length; break
        case 'thinking': chars += b.text.length; break
        case 'tool_use': chars += JSON.stringify(b.toolInput).length + b.toolName.length; break
        case 'tool_result': chars += b.content.length; break
      }
    }
  }
  if (req.tools) {
    for (const t of req.tools) chars += t.name.length + t.description.length + JSON.stringify(t.inputSchema).length
  }
  return Math.ceil(chars / 4)
}
