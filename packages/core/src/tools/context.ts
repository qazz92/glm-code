import type { Logger } from '../log.js'

export interface ToolContext {
  sessionId?: string
  log: Logger
  cwd: string
  /** Emit an event for hook plumbing (P5). */
  emit(event: string, data: unknown): void
}

export function makeNullContext(): ToolContext {
  return {
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {}, trace: () => {}, child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {}, trace: () => {}, child: (() => ({})) as any, level: 'silent', silent: true }) } as unknown as Logger,
    cwd: process.cwd(),
    emit: () => {},
  }
}
