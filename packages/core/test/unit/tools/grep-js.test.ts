import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { jsGrep } from '../../../src/tools/grep/js.js'

describe('grep JS fallback', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'glm-grep-'))
    // Create test files
    await writeFile(join(testDir, 'a.ts'), 'const hello = "world"\nconst foo = 42\n// TODO: fix\n')
    await writeFile(join(testDir, 'b.ts'), 'export function hello() {\n  return "hi"\n}\n')
    await mkdir(join(testDir, 'sub'))
    await writeFile(join(testDir, 'sub', 'c.ts'), 'const hello = "sub"\n')
    await writeFile(join(testDir, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('matches across files', async () => {
    const result = await jsGrep({ pattern: 'hello', cwd: testDir })
    expect(result.matches.length).toBe(3)
    const files = new Set(result.matches.map(m => m.file))
    expect(files.has('a.ts')).toBe(true)
    expect(files.has('b.ts')).toBe(true)
    expect(files.has(join('sub', 'c.ts'))).toBe(true)
  })

  test('honors include glob', async () => {
    const result = await jsGrep({ pattern: 'hello', cwd: testDir, include: ['*.ts'] })
    expect(result.matches.length).toBe(2)
    const files = new Set(result.matches.map(m => m.file))
    expect(files.has('a.ts')).toBe(true)
    expect(files.has('b.ts')).toBe(true)
    // sub/c.ts doesn't match *.ts (it's sub/c.ts)
    expect(files.has(join('sub', 'c.ts'))).toBe(false)
  })

  test('skips binary files', async () => {
    const result = await jsGrep({ pattern: '.', cwd: testDir })
    const binaryMatch = result.matches.find(m => m.file === 'binary.bin')
    expect(binaryMatch).toBeUndefined()
  })

  test('case insensitive', async () => {
    await writeFile(join(testDir, 'upper.ts'), 'CONST Hello = "WORLD"\n')
    const result = await jsGrep({ pattern: 'hello', cwd: testDir, caseInsensitive: true })
    expect(result.matches.length).toBeGreaterThanOrEqual(4)
  })

  test('returns line numbers', async () => {
    const result = await jsGrep({ pattern: 'TODO', cwd: testDir })
    expect(result.matches.length).toBe(1)
    expect(result.matches[0]!.line).toBe(3)
  })

  test('respects exclude', async () => {
    const result = await jsGrep({ pattern: 'hello', cwd: testDir, exclude: ['a.ts'] })
    const files = result.matches.map(m => m.file)
    expect(files.every(f => !f.endsWith('a.ts'))).toBe(true)
  })
})
