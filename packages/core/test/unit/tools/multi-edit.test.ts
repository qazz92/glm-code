import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { multiEditTool } from '../../../src/tools/edit/multi.js'

describe('multi-edit tool', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'glm-multi-'))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('applies multiple ops atomically', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3\nline4\nline5')
    const result = await multiEditTool.run({
      path: filePath,
      ops: [
        { anchor: '5', kind: 'replace', payload: ['~LINE5'] },
        { anchor: '1', kind: 'replace', payload: ['~LINE1'] },
      ],
    })
    const r = result as { path: string; opsApplied: number }
    expect(r.opsApplied).toBe(2)
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('LINE1\nline2\nline3\nline4\nLINE5')
  })

  test('aborts all ops if one fails (file unchanged)', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'line1\nline2\nline3')
    const original = await readFile(filePath, 'utf-8')

    await expect(multiEditTool.run({
      path: filePath,
      ops: [
        { anchor: '1', kind: 'replace', payload: ['~changed'] },
        { anchor: '99', kind: 'replace', payload: ['~bad'] },
      ],
    })).rejects.toThrow()

    // File should be unchanged
    const after = await readFile(filePath, 'utf-8')
    expect(after).toBe(original)
  })

  test('ops evaluated against original snapshot', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'a\nb\nc\nd\ne')
    await multiEditTool.run({
      path: filePath,
      ops: [
        { anchor: '1', kind: 'delete', payload: [] },
        { anchor: '3', kind: 'replace', payload: ['~C'] },
      ],
    })
    const content = await readFile(filePath, 'utf-8')
    // Delete line 1 (a), replace line 3 (c). Both against original.
    // After applying in desc order: replace line 3, then delete line 1.
    expect(content).toBe('b\nC\nd\ne')
  })

  test('fails on overlapping ranges', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'a\nb\nc\nd')
    await expect(multiEditTool.run({
      path: filePath,
      ops: [
        { anchor: '1-3', kind: 'replace_range', payload: ['~x'] },
        { anchor: '2', kind: 'replace', payload: ['~y'] },
      ],
    })).rejects.toThrow('Overlapping')
  })

  test('insert and delete combination', async () => {
    const filePath = join(testDir, 'file.txt')
    await writeFile(filePath, 'a\nb\nc')
    await multiEditTool.run({
      path: filePath,
      ops: [
        { anchor: '2', kind: 'delete', payload: [] },
        { anchor: '1', kind: 'insert_after', payload: ['~inserted'] },
      ],
    })
    const content = await readFile(filePath, 'utf-8')
    // Insert after line 1, then delete line 2. Desc order: delete line 2 (b), insert after line 1.
    expect(content).toBe('a\ninserted\nc')
  })
})
