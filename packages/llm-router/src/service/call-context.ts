import type { IRBlock } from '../ir/types.js'

/**
 * Accumulates partial response data during streaming.
 * Used to capture content when the stream is cancelled mid-flight.
 */
export class PartialBuffer {
  text = ''
  thinking = ''
  readonly toolBufs = new Map<string, { name: string; args: string }>()

  /** Feed a streaming event into the buffer. */
  appendText(delta: string): void {
    this.text += delta
  }

  appendThinking(delta: string): void {
    this.thinking += delta
  }

  appendToolStart(id: string, name: string): void {
    this.toolBufs.set(id, { name, args: '' })
  }

  appendToolInput(id: string, partial: string): void {
    const b = this.toolBufs.get(id)
    if (b) b.args += partial
  }

  /** Convert accumulated buffer into IRBlock[]. */
  toBlocks(): IRBlock[] {
    const blocks: IRBlock[] = []
    if (this.thinking) blocks.push({ type: 'thinking', text: this.thinking })
    if (this.text) blocks.push({ type: 'text', text: this.text })
    for (const [id, tb] of this.toolBufs.entries()) {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(tb.args || '{}') } catch { /* keep {} */ }
      blocks.push({ type: 'tool_use', toolUseId: id, toolName: tb.name, toolInput: parsed })
    }
    return blocks
  }

  get hasContent(): boolean {
    return this.text.length > 0 || this.thinking.length > 0 || this.toolBufs.size > 0
  }
}
