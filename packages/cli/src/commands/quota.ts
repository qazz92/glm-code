import { Command } from 'commander'
import kleur from 'kleur'
import { resolvePaths } from '@glm/shared'
import type { QuotaPool } from '@glm/shared'
import { openDb, runQuotaMigrations } from '@glm/core'
import { QuotaRepo, QuotaTracker } from '@glm/llm-router'
import { registerCommand } from '../registry.js'

const DEFAULT_TIER = 'pro' as const

export function registerQuotaCommand(program: Command): void {
  program.command('quota')
    .description('Show quota usage across pools (coding / web / vision)')
    .action(() => {
      const paths = resolvePaths()
      const db = openDb(paths.quotaDb)
      runQuotaMigrations(db)
      const tracker = new QuotaTracker(new QuotaRepo(db))
      for (const pool of ['coding', 'web', 'vision'] as QuotaPool[]) {
        const s = tracker.summary(pool, DEFAULT_TIER)
        const pct = s.dailyLimit ? Math.round((s.used / s.dailyLimit) * 100) : 0
        const colour = pct >= 95 ? kleur.red : pct >= 80 ? kleur.yellow : kleur.green
        const limitStr = s.dailyLimit != null ? String(s.dailyLimit) : '—'
        console.log(`${colour('●')} ${pool.padEnd(8)} ${s.used} req  (${limitStr} limit, ${pct}% used, ${s.guard})`)
      }
      db.close()
    })
}

registerCommand(registerQuotaCommand)
