import { execFileSync } from 'node:child_process'

/**
 * Best-effort macOS Keychain read. Returns undefined on any error or non-darwin.
 * Service = 'glm-code', account = profile name.
 */
export function readKeychain(profile: string): string | undefined {
  if (process.platform !== 'darwin') return undefined
  try {
    const out = execFileSync('security', ['find-generic-password', '-s', 'glm-code', '-a', profile, '-w'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    })
    return out.trim() || undefined
  } catch {
    return undefined
  }
}
