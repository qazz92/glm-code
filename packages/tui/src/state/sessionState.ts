import { Emitter } from './store.js'

export interface SessionMeta {
  id: string
  cwd: string
  initialTask: string | null
}

export interface SessionState {
  get(): SessionMeta | null
  set(m: SessionMeta): void
  clear(): void
  subscribe(fn: () => void): () => void
}

export function createSessionState(): SessionState {
  let current: SessionMeta | null = null
  const em = new Emitter()
  return {
    get: () => current,
    set(m) {
      current = m
      em.emit()
    },
    clear() {
      current = null
      em.emit()
    },
    subscribe: (fn) => em.subscribe(fn),
  }
}
