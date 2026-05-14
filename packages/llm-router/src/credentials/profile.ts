import { resolvePaths } from '@glm/shared'
import { readCredentialsFile, writeCredentialsFile, type ProfileCred } from './credentials-file.js'

export function listProfiles(): { active: string; profiles: { name: string; tier?: string }[] } {
  const path = resolvePaths().root + '/credentials.json'
  const f = readCredentialsFile(path)
  if (!f) return { active: 'default', profiles: [] }
  return {
    active: f.defaultProfile,
    profiles: Object.entries(f.profiles).map(([name, p]) => ({ name, tier: p.tier })),
  }
}

export function setActiveProfile(name: string): void {
  const path = resolvePaths().root + '/credentials.json'
  const f = readCredentialsFile(path) ?? { defaultProfile: 'default', profiles: {} }
  if (!f.profiles[name]) throw new Error(`profile '${name}' not found`)
  f.defaultProfile = name
  writeCredentialsFile(path, f)
}

export function getProfile(name?: string): ProfileCred | undefined {
  const path = resolvePaths().root + '/credentials.json'
  const f = readCredentialsFile(path)
  if (!f) return undefined
  return f.profiles[name ?? f.defaultProfile]
}
