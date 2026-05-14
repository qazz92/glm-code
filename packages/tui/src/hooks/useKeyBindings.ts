import { useInput } from 'ink'

export interface KeyBindingHandlers {
  onTab: () => void
  onEscape: () => void
  onCtrlD: () => void
}

export function useKeyBindings(h: KeyBindingHandlers): void {
  useInput((input, key) => {
    if (key.tab) { h.onTab(); return }
    if (key.escape) { h.onEscape(); return }
    if (key.ctrl && input === 'd') { h.onCtrlD(); return }
  })
}
