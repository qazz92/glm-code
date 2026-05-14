import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { resetRouter, getRouter } from '../../../src/tools/read/tool.js'

describe('read tool (local file)', () => {
  let testDir: string

  beforeEach(async () => {
    resetRouter()
    testDir = await mkdtemp(join(tmpdir(), 'glm-read-test-'))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('reads a plain file', async () => {
    await writeFile(join(testDir, 'hello.txt'), 'hello world')
    const result = await getRouter().read(join(testDir, 'hello.txt'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toContain('hello world')
  })

  test('reads with inclusive selector', async () => {
    await writeFile(join(testDir, 'lines.txt'), 'aaa\nbbb\nccc\nddd\neee')
    const result = await getRouter().read(join(testDir, 'lines.txt:2-4'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Selector is applied by the router's read(), but local handler already slices
      // The content should contain lines 2-4
      expect(result.data).toContain('bbb')
      expect(result.data).toContain('ccc')
      expect(result.data).toContain('ddd')
    }
  })

  test('reads with count selector', async () => {
    await writeFile(join(testDir, 'count.txt'), 'a\nb\nc\nd\ne')
    const result = await getRouter().read(join(testDir, 'count.txt:2+2'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toContain('b')
      expect(result.data).toContain('c')
    }
  })

  test('returns error for missing file', async () => {
    const result = await getRouter().read(join(testDir, 'nope.txt'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  test('returns error for directory', async () => {
    await mkdir(join(testDir, 'subdir'))
    const result = await getRouter().read(join(testDir, 'subdir'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
  })
})
