function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function anthropicCannedStream(kind: 'text' | 'tool_use' | 'with_thinking'): string[] {
  const out: string[] = []
  out.push(frame('message_start', { type: 'message_start', message: { id: 'msg_mock', model: 'GLM-5.1', usage: { input_tokens: 10, output_tokens: 0 } } }))

  if (kind === 'with_thinking') {
    out.push(frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }))
    out.push(frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning...' } }))
    out.push(frame('content_block_stop', { type: 'content_block_stop', index: 0 }))
  }

  const textIdx = kind === 'with_thinking' ? 1 : 0
  out.push(frame('content_block_start', { type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }))
  out.push(frame('content_block_delta', { type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: 'Hello' } }))
  out.push(frame('content_block_delta', { type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: ' world' } }))
  out.push(frame('content_block_stop', { type: 'content_block_stop', index: textIdx }))

  if (kind === 'tool_use') {
    out.push(frame('content_block_start', { type: 'content_block_start', index: textIdx + 1, content_block: { type: 'tool_use', id: 'tu_mock', name: 'read', input: {} } }))
    out.push(frame('content_block_delta', { type: 'content_block_delta', index: textIdx + 1, delta: { type: 'input_json_delta', partial_json: '{"path":"/x"}' } }))
    out.push(frame('content_block_stop', { type: 'content_block_stop', index: textIdx + 1 }))
    out.push(frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 6 } }))
  } else {
    out.push(frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }))
  }
  out.push(frame('message_stop', { type: 'message_stop' }))
  return out
}
