import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { globTool } from '../../../src/tools/glob/tool.js'
import { makeNullContext } from '../../../src/tools/context.js'

describe('glob tool', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'glm-glob-'))
    await writeFile(join(testDir, 'a.ts'), '')
    await writeFile(join(testDir, 'b.ts'), '')
    await writeFile(join(testDir, 'readme.md'), '')
    await mkdir(join(testDir, 'sub'))
    await writeFile(join(testDir, 'sub', 'c.ts'), '')
    await writeFile(join(testDir, 'sub', 'd.js'), '')
    await mkdir(join(testDir, 'node_modules'))
    await writeFile(join(testDir, 'node_modules', 'pkg.js'), '')
    await mkdir(join(testDir, '.hidden'))
    await writeFile(join(testDir, '.hidden', 'e.ts'), '')
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('finds TypeScript files', async () => {
    const ctx = makeNullContext()
    ctx.cwd = testDir
    const result = await globTool.run({ pattern: '**/*.ts' }, ctx)
    const r = result as { ok: boolean; data?: { files: string[]; count: number } }
    expect(r.ok).toBe(true)
    expect(r.data?.count).toBe(3)
    expect(r.data?.files).toContain('a.ts')
    expect(r.data?.files).toContain('b.ts')
    expect(r.data?.files).toContain(join('sub', 'c.ts'))
  })

  test('finds all files with star pattern', async () => {
    const ctx = makeNullContext()
    ctx.cwd = testDir
    const result = await globTool.run({ pattern: '**/*' }, ctx)
    const r = result as { ok: boolean; data?: { files: string[] } }
    expect(r.ok).toBe(true)
    // Should include .ts, .md, .js files but NOT node_modules
    const files = r.data?.files ?? []
    expect(files.some(f => f.endsWith('a.ts'))).toBe(true)
    expect(files.some(f => f.includes('node_modules'))).toBe(false)
  })

  test('skips hidden dirs by default', async () => {
    const ctx = makeNullContext()
    ctx.cwd = testDir
    const result = await globTool.run({ pattern: '**/*.ts' }, ctx)
    const r = result as { ok: boolean; data?: { files: string[] } }
    const files = r.data?.files ?? []
    expect(files.some(f => f.includes('.hidden'))).toBe(false)
  })

  test('includes hidden dirs with dot: true', async () => {
    const ctx = makeNullContext()
    ctx.cwd = testDir
    const result = await globTool.run({ pattern: '**/*.ts', dot: true }, ctx)
    const r = result as { ok: boolean; data?: { files: string[] } }
    const files = r.data?.files ?? []
    expect(files.some(f => f.includes('.hidden'))).toBe(true)
  })

  test('honors ignore patterns', async () => {
    const ctx = makeNullContext()
    ctx.cwd = testDir
    const result = await globTool.run({ pattern: '**/*', ignore: ['**/*.md'] }, ctx)
    const r = result as { ok: boolean; data?: { files: string[] } }
    const files = r.data?.files ?? []
    expect(files.some(f => f.endsWith('.md'))).toBe(false)
    expect(files.some(f => f.endsWith('.ts'))).toBe(true)
  })

  test('resolves relative to cwd', async () => {
    const ctx = makeNullContext()
    ctx.cwd = testDir
    const result = await globTool.run({ pattern: '*.ts' }, ctx)
    const r = result as { ok: boolean; data?: { files: string[] } }
    const files = r.data?.files ?? []
    expect(files.length).toBe(2)
    expect(files).toContain('a.ts')
    expect(files).toContain('b.ts')
  })
})
