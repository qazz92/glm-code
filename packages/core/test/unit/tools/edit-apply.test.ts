import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { editTool } from '../../../src/tools/edit/tool.js'

describe('edit tool — apply', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'glm-edit-'))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('replaces a single line', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3')
    const result = await editTool.run({
      path: filePath,
      ops: [{ anchor: '2', kind: 'replace', payload: ['~replaced'] }],
    })
    const r = result as { ok: boolean; data?: { opsApplied: number } }
    expect(r.ok).toBe(true)
    expect(r.data?.opsApplied).toBe(1)
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('line1\nreplaced\nline3')
  })

  test('inserts after a line', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3')
    await editTool.run({
      path: filePath,
      ops: [{ anchor: '2', kind: 'insert_after', payload: ['~inserted'] }],
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('line1\nline2\ninserted\nline3')
  })

  test('inserts before a line', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3')
    await editTool.run({
      path: filePath,
      ops: [{ anchor: '2', kind: 'insert_before', payload: ['~inserted'] }],
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('line1\ninserted\nline2\nline3')
  })

  test('deletes a line', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3')
    await editTool.run({
      path: filePath,
      ops: [{ anchor: '2', kind: 'delete', payload: [] }],
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('line1\nline3')
  })

  test('replaces a range', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3\nline4\nline5')
    await editTool.run({
      path: filePath,
      ops: [{ anchor: '2-4', kind: 'replace_range', payload: ['~new1', '~new2'] }],
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('line1\nnew1\nnew2\nline5')
  })

  test('fails on line out of range', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2')
    const result = await editTool.run({
      path: filePath,
      ops: [{ anchor: '10', kind: 'replace', payload: ['~x'] }],
    })
    const r = result as { ok: boolean; error?: { message: string } }
    expect(r.ok).toBe(false)
    expect(r.error?.message).toContain('exceeds file length')
  })

  test('fails on invalid range', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3')
    const result = await editTool.run({
      path: filePath,
      ops: [{ anchor: '2-10', kind: 'replace_range', payload: ['~x'] }],
    })
    const r = result as { ok: boolean; error?: { message: string } }
    expect(r.ok).toBe(false)
  })

  test('fails on non-existent file', async () => {
    const result = await editTool.run({
      path: join(testDir, 'nope.txt'),
      ops: [{ anchor: '1', kind: 'replace', payload: ['~x'] }],
    })
    const r = result as { ok: boolean }
    expect(r.ok).toBe(false)
  })

  test('strips ~ prefix from payload', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'old')
    await editTool.run({
      path: filePath,
      ops: [{ anchor: '1', kind: 'replace', payload: ['~new content'] }],
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('new content')
  })

  test('strips hashline read prefix from payload', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'old')
    await editTool.run({
      path: filePath,
      ops: [{ anchor: '1', kind: 'replace', payload: ['~3wr|new content'] }],
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('new content')
  })
})
