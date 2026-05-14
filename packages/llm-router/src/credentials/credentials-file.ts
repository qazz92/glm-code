import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

export interface ProfileCred {
  apiKey: string
  baseUrl?: string
  endpointOverride?: 'anthropic' | 'openai'
  tier?: 'lite' | 'pro' | 'max'
}

export interface CredentialsFile {
  defaultProfile: string
  profiles: Record<string, ProfileCred>
}

export function readCredentialsFile(path: string): CredentialsFile | undefined {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CredentialsFile
  } catch {
    return undefined
  }
}

export function writeCredentialsFile(path: string, file: CredentialsFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(file, null, 2), { mode: 0o600 })
  try { chmodSync(path, 0o600) } catch { /* best effort */ }
}
