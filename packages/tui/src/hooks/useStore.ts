import { useEffect, useReducer } from 'react'

export interface Subscribable<T> {
  get(): T
  subscribe(fn: () => void): () => void
}

export function useStore<T>(slice: Subscribable<T>): T {
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    return slice.subscribe(() => force())
  }, [slice])
  return slice.get()
}
