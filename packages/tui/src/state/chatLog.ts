import { Emitter } from './store.js'

export type ChatRole = 'user' | 'assistant' | 'system' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  ts: string
  streaming: boolean
}

export interface ChatLog {
  snapshot(): ReadonlyArray<ChatMessage>
  appendUserMessage(text: string): ChatMessage
  appendAssistantMessage(text: string): ChatMessage
  appendSystemMessage(text: string): ChatMessage
  appendError(text: string): ChatMessage
  beginAssistantStream(id: string): ChatMessage
  appendStreamChunk(id: string, chunk: string): void
  endStream(id: string): void
  subscribe(fn: () => void): () => void
}

let counter = 0
function nextId(): string {
  counter += 1
  return `m-${Date.now()}-${counter}`
}

export function createChatLog(): ChatLog {
  const messages: ChatMessage[] = []
  const em = new Emitter()

  function push(m: ChatMessage): ChatMessage {
    messages.push(m)
    em.emit()
    return m
  }

  return {
    snapshot: () => messages.slice(),
    appendUserMessage: (text) =>
      push({ id: nextId(), role: 'user', text, ts: new Date().toISOString(), streaming: false }),
    appendAssistantMessage: (text) =>
      push({ id: nextId(), role: 'assistant', text, ts: new Date().toISOString(), streaming: false }),
    appendSystemMessage: (text) =>
      push({ id: nextId(), role: 'system', text, ts: new Date().toISOString(), streaming: false }),
    appendError: (text) =>
      push({ id: nextId(), role: 'error', text, ts: new Date().toISOString(), streaming: false }),
    beginAssistantStream: (id) =>
      push({ id, role: 'assistant', text: '', ts: new Date().toISOString(), streaming: true }),
    appendStreamChunk: (id, chunk) => {
      const m = messages.find((x) => x.id === id)
      if (!m) return
      m.text += chunk
      em.emit()
    },
    endStream: (id) => {
      const m = messages.find((x) => x.id === id)
      if (!m) return
      m.streaming = false
      em.emit()
    },
    subscribe: (fn) => em.subscribe(fn),
  }
}
