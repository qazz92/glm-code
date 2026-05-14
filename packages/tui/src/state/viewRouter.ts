import { Emitter } from './store.js'

export type ViewName = 'chat' | 'dashboard'

export interface ViewRouter {
  get(): ViewName
  setView(v: ViewName): void
  toggle(): void
  subscribe(fn: () => void): () => void
}

export function createViewRouter(initial: ViewName = 'chat'): ViewRouter {
  let current: ViewName = initial
  const em = new Emitter()
  return {
    get: () => current,
    setView(v) {
      if (v === current) return
      current = v
      em.emit()
    },
    toggle() {
      current = current === 'chat' ? 'dashboard' : 'chat'
      em.emit()
    },
    subscribe: (fn) => em.subscribe(fn),
  }
}
