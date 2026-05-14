export type Listener = () => void

export class Emitter {
  private listeners = new Set<Listener>()
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  emit(): void {
    for (const l of this.listeners) l()
  }
}
