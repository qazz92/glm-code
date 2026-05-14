import { Command } from 'commander'
import kleur from 'kleur'
import { CONCURRENCY, preferredEndpoint } from '@glm/llm-router'
import type { LLMModel } from '@glm/shared'
import { registerCommand } from '../registry.js'

const MODELS: LLMModel[] = [
  'GLM-5.1', 'GLM-5-Turbo', 'GLM-5', 'GLM-4.7', 'GLM-4.6',
  'GLM-4.5-Air', 'GLM-4.5-AirX', 'GLM-4.5',
]

export function registerModelsCommand(program: Command): void {
  program.command('models')
    .description('List supported models with endpoint + concurrency')
    .action(() => {
      console.log(kleur.bold('Model'.padEnd(16)) + kleur.bold('Endpoint'.padEnd(12)) + kleur.bold('Slots'))
      for (const m of MODELS) {
        const ep = preferredEndpoint(m)
        const conc = CONCURRENCY[m]
        console.log(`${m.padEnd(16)}${ep.padEnd(12)}${conc}`)
      }
    })
}

registerCommand(registerModelsCommand)
