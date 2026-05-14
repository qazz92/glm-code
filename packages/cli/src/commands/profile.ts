import { Command } from 'commander'
import kleur from 'kleur'
import { listProfiles, setActiveProfile } from '@glm/llm-router'
import { registerCommand } from '../registry.js'

export function registerProfileCommand(program: Command): void {
  const profile = program.command('profile').description('Manage credential profiles')

  profile.command('list')
    .description('List configured profiles')
    .action(() => {
      const { active, profiles } = listProfiles()
      if (profiles.length === 0) {
        console.log(kleur.gray('(no profiles in ~/.glm/credentials.json)'))
        return
      }
      for (const p of profiles) {
        const mark = p.name === active ? kleur.green('●') : '○'
        console.log(`${mark} ${p.name}${p.tier ? kleur.dim(`  (${p.tier})`) : ''}`)
      }
    })

  profile.command('use <name>')
    .description('Set the default profile')
    .action((name: string) => {
      setActiveProfile(name)
      console.log(`${kleur.green('✓')} default profile = ${name}`)
    })
}

registerCommand(registerProfileCommand)
