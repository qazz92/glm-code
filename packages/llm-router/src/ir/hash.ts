import { createHash } from 'node:crypto'

/**
 * Recursively sort object keys for deterministic serialization.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value.toString()
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']'
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}'
  }
  return String(value)
}

/**
 * SHA-256 of the canonical JSON representation.
 */
export function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}
