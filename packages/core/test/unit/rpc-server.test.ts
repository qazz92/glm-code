import { describe, expect, test } from 'vitest'
import { RpcServer } from '../../src/rpc/server.js'
import { createLogger } from '../../src/log.js'

function mockSocket(): any {
  const chunks: string[] = []
  let dataCb: Function | null = null
  return {
    write: (data: string) => { chunks.push(data) },
    on: (event: string, cb: Function) => { if (event === 'data') dataCb = cb },
    getDataCb: () => dataCb,
    getChunks: () => chunks,
    getLastResponse: () => {
      if (chunks.length === 0) return null
      return JSON.parse(chunks[chunks.length - 1].trim())
    }
  }
}

describe('RpcServer', () => {
  test('dispatches to registered handler and sends response', async () => {
    const log = createLogger('test', { level: 'silent' })
    const server = new RpcServer(log)
    server.on('test.method', async (params) => ({ echo: params }))
    const sock = mockSocket()
    server.attach(sock, { clientId: 'test' })
    sock.getDataCb()!(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test.method', params: { x: 42 } }) + '\n'))
    await new Promise(r => setTimeout(r, 50))
    const resp = sock.getLastResponse()
    expect(resp.id).toBe(1)
    expect(resp.result).toEqual({ echo: { x: 42 } })
  })

  test('returns METHOD_NOT_FOUND for unregistered method', async () => {
    const log = createLogger('test', { level: 'silent' })
    const server = new RpcServer(log)
    const sock = mockSocket()
    server.attach(sock, { clientId: 'test' })
    sock.getDataCb()!(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'nonexistent' }) + '\n'))
    await new Promise(r => setTimeout(r, 50))
    const resp = sock.getLastResponse()
    expect(resp.error.code).toBe(-32601)
  })

  test('returns PARSE_ERROR for invalid JSON', async () => {
    const log = createLogger('test', { level: 'silent' })
    const server = new RpcServer(log)
    const sock = mockSocket()
    server.attach(sock, { clientId: 'test' })
    sock.getDataCb()!(Buffer.from('not-json\n'))
    await new Promise(r => setTimeout(r, 50))
    const resp = sock.getLastResponse()
    expect(resp.error.code).toBe(-32700)
  })

  test('returns INTERNAL_ERROR when handler throws', async () => {
    const log = createLogger('test', { level: 'silent' })
    const server = new RpcServer(log)
    server.on('boom', async () => { throw new Error('kaboom') })
    const sock = mockSocket()
    server.attach(sock, { clientId: 'test' })
    sock.getDataCb()!(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'boom' }) + '\n'))
    await new Promise(r => setTimeout(r, 50))
    const resp = sock.getLastResponse()
    expect(resp.error.code).toBe(-32603)
    expect(resp.error.message).toBe('kaboom')
  })

  test('returns INVALID_REQUEST for missing jsonrpc field', async () => {
    const log = createLogger('test', { level: 'silent' })
    const server = new RpcServer(log)
    const sock = mockSocket()
    server.attach(sock, { clientId: 'test' })
    sock.getDataCb()!(Buffer.from(JSON.stringify({ id: 4, method: 'test' }) + '\n'))
    await new Promise(r => setTimeout(r, 50))
    const resp = sock.getLastResponse()
    expect(resp.error.code).toBe(-32600)
  })
})
