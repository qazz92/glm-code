/**
 * Strip the `~` payload prefix and hashline read prefix from edit payload lines.
 *
 * Edit ops arrive as lines like `~actual content` where the leading `~` is the
 * payload marker. Additionally, when the LLM echoes back a hashline-annotated
 * read line (e.g. `42sr|// ≡ab const x = 1`), we strip that prefix too.
 */

/** Match a hashline read-prefix like `42sr|` or `3wr|` (digits + bigram + pipe). */
const HASHLINE_READ_PREFIX_RE = /^\d+[a-z]{2}\|/

/**
 * Strip leading `~` from a payload line, and also strip any hashline read-prefix
 * that may appear after it. Returns the cleaned line.
 */
export function stripPayloadPrefix(line: string): string {
  let s = line
  if (s.startsWith('~')) s = s.slice(1)
  s = s.replace(HASHLINE_READ_PREFIX_RE, '')
  return s
}
