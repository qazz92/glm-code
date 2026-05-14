import picomatch from 'picomatch'

export interface PermissionSettings {
  allow?: string[]
  deny?: string[]
}

export function checkPermission(
  toolName: string,
  params: Record<string, unknown>,
  settings?: PermissionSettings
): boolean {
  // P3 stub: default allow. P5 adds real enforcement.
  if (!settings) return true
  const deny = settings.deny ?? []
  for (const pattern of deny) {
    if (picomatch(pattern)(toolName)) return false
  }
  const allow = settings.allow ?? []
  if (allow.length === 0) return true
  for (const pattern of allow) {
    if (picomatch(pattern)(toolName)) return true
  }
  return false
}
