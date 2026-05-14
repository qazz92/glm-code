export interface ParsedSlash {
  name: string
  args: string[]
}

export function parseSlash(input: string): ParsedSlash | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const body = trimmed.slice(1).trim()
  if (body.length === 0) return null
  // simple tokenizer with double-quote support
  const tokens: string[] = []
  let i = 0
  while (i < body.length) {
    if (body[i] === ' ') { i++; continue }
    if (body[i] === '"') {
      const end = body.indexOf('"', i + 1)
      if (end === -1) { tokens.push(body.slice(i + 1)); break }
      tokens.push(body.slice(i + 1, end))
      i = end + 1
      continue
    }
    let j = i
    while (j < body.length && body[j] !== ' ') j++
    tokens.push(body.slice(i, j))
    i = j
  }
  const [name, ...args] = tokens
  if (!name) return null
  return { name, args }
}
