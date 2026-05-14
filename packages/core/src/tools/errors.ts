export type ToolErrorCode = 'NOT_FOUND' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'RUNTIME_ERROR' | 'TIMEOUT'

export interface ToolError {
  code: ToolErrorCode
  message: string
  detail?: unknown
}

export interface ToolResult<T = unknown> {
  ok: boolean
  data?: T
  error?: ToolError
}

export function toolOk<T>(data: T): ToolResult<T> { return { ok: true, data } }
export function toolErr<T = never>(code: ToolErrorCode, message: string, detail?: unknown): ToolResult<T> {
  return detail !== undefined
    ? { ok: false, error: { code, message, detail } }
    : { ok: false, error: { code, message } }
}
