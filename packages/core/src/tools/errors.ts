export type ToolErrorCode = 'NOT_FOUND' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'RUNTIME_ERROR'

export interface ToolError {
  code: ToolErrorCode
  message: string
}

export interface ToolResult<T = unknown> {
  ok: boolean
  data?: T
  error?: ToolError
}

export function toolOk<T>(data: T): ToolResult<T> { return { ok: true, data } }
export function toolErr(code: ToolErrorCode, message: string): ToolResult<never> { return { ok: false, error: { code, message } } }
