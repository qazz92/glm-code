import { readCredentialsFile } from './credentials-file.js'
import { readKeychain } from './keychain.js'

export interface ResolvedCredentials {
  apiKey: string | undefined
  baseUrlOverride?: string
  endpointOverride?: 'anthropic' | 'openai'
  tier?: 'lite' | 'pro' | 'max'
  source: string
  profile: string
}

export interface ResolveOpts {
  env?: NodeJS.ProcessEnv
  credentialsFile: string
  profile?: string
  allowKeychain?: boolean
}

export function resolveCredentials(opts: ResolveOpts): ResolvedCredentials {
  const env = opts.env ?? process.env

  // 1) Env precedence
  if (env.GLM_API_KEY) {
    return { apiKey: env.GLM_API_KEY, source: 'env:GLM_API_KEY', profile: opts.profile ?? 'default' }
  }
  if (env.ZAI_API_KEY) {
    return { apiKey: env.ZAI_API_KEY, source: 'env:ZAI_API_KEY', profile: opts.profile ?? 'default' }
  }
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL.includes('z.ai')) {
    return {
      apiKey: env.ANTHROPIC_API_KEY,
      baseUrlOverride: env.ANTHROPIC_BASE_URL,
      source: 'env:ANTHROPIC_API_KEY',
      profile: opts.profile ?? 'default',
    }
  }

  // 2) credentials.json
  const file = readCredentialsFile(opts.credentialsFile)
  if (file) {
    const name = opts.profile ?? file.defaultProfile
    const prof = file.profiles[name]
    if (prof) {
      return {
        apiKey: prof.apiKey,
        baseUrlOverride: prof.baseUrl,
        endpointOverride: prof.endpointOverride,
        tier: prof.tier,
        source: `file:${name}`,
        profile: name,
      }
    }
  }

  // 3) Keychain (opt-in)
  if (opts.allowKeychain) {
    const name = opts.profile ?? 'default'
    const k = readKeychain(name)
    if (k) return { apiKey: k, source: `keychain:${name}`, profile: name }
  }

  return { apiKey: undefined, source: 'none', profile: opts.profile ?? 'default' }
}
