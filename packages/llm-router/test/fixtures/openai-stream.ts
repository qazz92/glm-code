function chunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export function openaiCannedStream(kind: 'text' | 'tool_use'): string[] {
  const out: string[] = []
  out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { role: 'assistant' } }] }))
  out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: 'Hello' } }] }))
  out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: ' world' } }] }))

  if (kind === 'tool_use') {
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_mock', type: 'function', function: { name: 'read', arguments: '' } }] } }] }))
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"/x"}' } }] } }] }))
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 4, completion_tokens: 5 } }))
  } else {
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } }))
  }
  out.push('data: [DONE]\n\n')
  return out
}
