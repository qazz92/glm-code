import { Command } from 'commander'
import kleur from 'kleur'
import { resolvePaths } from '@glm/shared'
import { openDb, runMigrations } from '@glm/core'
import { IdempotencyCache } from '@glm/llm-router'
import { registerCommand } from '../registry.js'

export function registerCacheCommand(program: Command): void {
  const cache = program.command('cache').description('LLM idempotency cache management')

  cache.command('stats')
    .description('Show cache entries / hits / misses')
    .action(() => {
      const paths = resolvePaths()
      const db = openDb(`${paths.root}/registry.db`)
      runMigrations(db)
      const c = new IdempotencyCache(db)
      const s = c.stats()
      console.log(`entries:  ${s.entries}`)
      console.log(`hits:     ${s.hits}`)
      console.log(`misses:   ${s.misses}`)
      db.close()
    })

  cache.command('clear')
    .description('Empty the LLM cache')
    .action(() => {
      const paths = resolvePaths()
      const db = openDb(`${paths.root}/registry.db`)
      runMigrations(db)
      const c = new IdempotencyCache(db)
      const before = c.stats().entries
      c.clear()
      console.log(`${kleur.green('✓')} cleared ${before} cache entries`)
      db.close()
    })
}

registerCommand(registerCacheCommand)
