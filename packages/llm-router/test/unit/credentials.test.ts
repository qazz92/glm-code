import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveCredentials } from '../../src/credentials/resolver.js'
import { writeCredentialsFile } from '../../src/credentials/credentials-file.js'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('resolveCredentials', () => {
  test('GLM_API_KEY env wins over file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const credFile = path.join(tmp, 'credentials.json')
    writeCredentialsFile(credFile, { defaultProfile: 'default', profiles: { default: { apiKey: 'FROM_FILE' } } })
    const c = resolveCredentials({ env: { GLM_API_KEY: 'FROM_ENV' }, credentialsFile: credFile })
    expect(c.apiKey).toBe('FROM_ENV')
    expect(c.source).toBe('env:GLM_API_KEY')
  })

  test('ZAI_API_KEY falls back when GLM not set', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const c = resolveCredentials({ env: { ZAI_API_KEY: 'Z' }, credentialsFile: path.join(tmp, 'none.json') })
    expect(c.apiKey).toBe('Z')
    expect(c.source).toBe('env:ZAI_API_KEY')
  })

  test('ANTHROPIC_API_KEY only used when ANTHROPIC_BASE_URL points at z.ai', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const noFile = path.join(tmp, 'none.json')
    const c1 = resolveCredentials({ env: { ANTHROPIC_API_KEY: 'A', ANTHROPIC_BASE_URL: 'https://api.z.ai' }, credentialsFile: noFile })
    expect(c1.apiKey).toBe('A')
    const c2 = resolveCredentials({ env: { ANTHROPIC_API_KEY: 'A', ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }, credentialsFile: noFile })
    expect(c2.apiKey).toBeUndefined()
  })

  test('file fallback uses profile.apiKey', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const credFile = path.join(tmp, 'credentials.json')
    writeCredentialsFile(credFile, { defaultProfile: 'work', profiles: { work: { apiKey: 'WORK_KEY', tier: 'pro' } } })
    const c = resolveCredentials({ env: {}, credentialsFile: credFile })
    expect(c.apiKey).toBe('WORK_KEY')
    expect(c.tier).toBe('pro')
    expect(c.source).toBe('file:work')
  })

  test('explicit profile overrides defaultProfile', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const credFile = path.join(tmp, 'credentials.json')
    writeCredentialsFile(credFile, {
      defaultProfile: 'work',
      profiles: { work: { apiKey: 'W' }, personal: { apiKey: 'P' } },
    })
    const c = resolveCredentials({ env: {}, credentialsFile: credFile, profile: 'personal' })
    expect(c.apiKey).toBe('P')
    expect(c.source).toBe('file:personal')
  })
})
