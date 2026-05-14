import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readPid, writePid, removePid, isPidAlive } from '../../src/daemon/pid.js'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('pid file', () => {
  test('writePid + readPid round-trip', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    const f = path.join(tmp, 'd.pid')
    writePid(f, 12345)
    expect(readPid(f)).toBe(12345)
  })

  test('readPid returns undefined for missing file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    expect(readPid(path.join(tmp, 'none.pid'))).toBeUndefined()
  })

  test('readPid returns undefined for garbage', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    const f = path.join(tmp, 'g.pid')
    writeFileSync(f, 'not-a-number')
    expect(readPid(f)).toBeUndefined()
  })

  test('isPidAlive(current)', () => {
    expect(isPidAlive(process.pid)).toBe(true)
  })

  test('isPidAlive(unlikely large)', () => {
    expect(isPidAlive(2_000_000_000)).toBe(false)
  })

  test('removePid is safe on missing file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    removePid(path.join(tmp, 'none.pid'))
    expect(existsSync(path.join(tmp, 'none.pid'))).toBe(false)
  })
})
