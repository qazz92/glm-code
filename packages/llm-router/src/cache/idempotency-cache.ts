import type { Database } from 'better-sqlite3'
import type { IRRequest, IRResponse } from '../ir/types.js'
import { cacheKey } from './key.js'

export interface CacheStats {
  hits: number
  misses: number
  entries: number
}

export class IdempotencyCache {
  private hitCount = 0
  private missCount = 0

  constructor(private db: Database) {}

  get(role: string, req: IRRequest): IRResponse | null {
    const key = cacheKey(role, req)
    const row = this.db.prepare(
      `SELECT response_json, usage_input, usage_output FROM llm_cache WHERE key = ?`
    ).get(key) as { response_json: Buffer; usage_input: number; usage_output: number } | undefined

    if (!row) {
      this.missCount++
      return null
    }

    this.hitCount++
    const now = new Date().toISOString()
    this.db.prepare(
      `UPDATE llm_cache SET last_hit_at = ?, hit_count = hit_count + 1 WHERE key = ?`
    ).run(now, key)

    return JSON.parse(row.response_json.toString('utf8')) as IRResponse
  }

  put(role: string, req: IRRequest, response: IRResponse): void {
    const key = cacheKey(role, req)
    const now = new Date().toISOString()
    this.db.prepare(
      `INSERT OR REPLACE INTO llm_cache
        (key, model, endpoint, request_json, response_json, usage_input, usage_output, created_at, last_hit_at, hit_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      key,
      req.model,
      req.endpoint,
      Buffer.from(JSON.stringify(req), 'utf8'),
      Buffer.from(JSON.stringify(response), 'utf8'),
      response.usage.inputTokens,
      response.usage.outputTokens,
      now,
      now,
    )
  }

  clear(): void {
    this.db.prepare(`DELETE FROM llm_cache`).run()
    this.hitCount = 0
    this.missCount = 0
  }

  stats(): CacheStats {
    const row = this.db.prepare(`SELECT COUNT(*) as n FROM llm_cache`).get() as { n: number }
    return { hits: this.hitCount, misses: this.missCount, entries: row.n }
  }
}
