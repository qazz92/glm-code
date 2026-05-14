import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeTool } from '../../../src/tools/write/tool.js'

describe('write tool', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'glm-write-test-'))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('writes content to a new file', async () => {
    const filePath = join(testDir, 'output.txt')
    const result = await writeTool.run({ path: filePath, content: 'hello' })
    const written = result as { path: string; bytes: number }
    expect(written.bytes).toBe(5)
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('hello')
  })

  test('overwrites existing file atomically', async () => {
    const filePath = join(testDir, 'existing.txt')
    await writeTool.run({ path: filePath, content: 'old' })
    await writeTool.run({ path: filePath, content: 'new' })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('new')
  })

  test('creates parent directories by default', async () => {
    const filePath = join(testDir, 'a', 'b', 'deep.txt')
    await writeTool.run({ path: filePath, content: 'nested' })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('nested')
  })

  test('fails when createParents is false and parent missing', async () => {
    const filePath = join(testDir, 'missing', 'file.txt')
    await expect(writeTool.run({ path: filePath, content: 'x', createParents: false }))
      .rejects.toThrow()
  })

  test('no temp file left on success', async () => {
    const filePath = join(testDir, 'clean.txt')
    await writeTool.run({ path: filePath, content: 'data' })
    const dir = await import('node:fs/promises').then(m => m.readdir(testDir))
    const tmpFiles = dir.filter(f => f.startsWith('.~'))
    expect(tmpFiles).toHaveLength(0)
  })
})
