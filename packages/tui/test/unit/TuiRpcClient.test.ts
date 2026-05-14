import { describe, expect, test } from 'vitest'
import { EventEmitter } from 'node:events'
import { TuiRpcClient } from '../../src/rpc/TuiRpcClient.js'

interface FakeSocket extends EventEmitter {
  write: (data: string) => boolean
  end: () => void
  written: string[]
}

function makeFakeSocket(): FakeSocket {
  const e = new EventEmitter() as FakeSocket
  e.written = []
  e.write = (d: string) => { e.written.push(d); return true }
  e.end = () => { e.emit('close') }
  return e
}

describe('TuiRpcClient', () => {
  test('call() resolves on matching response id', async () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const p = c.call<{ pong: boolean }>('ping')
    // simulate daemon response
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { pong: true } }) + '\n'))
    const result = await p
    expect(result.pong).toBe(true)
    expect(sock.written[0]).toContain('"method":"ping"')
  })

  test('error response rejects the call', async () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const p = c.call('boom')
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'not found' } }) + '\n'))
    await expect(p).rejects.toThrow(/not found/)
  })

  test('subscribe() receives notifications (no id)', () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const seen: unknown[] = []
    c.subscribe('message.delta', (params) => seen.push(params))
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'message.delta', params: { text: 'hi' } }) + '\n'))
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'message.delta', params: { text: ' there' } }) + '\n'))
    expect(seen).toEqual([{ text: 'hi' }, { text: ' there' }])
  })

  test('split frames across chunks are reassembled', () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const seen: unknown[] = []
    c.subscribe('x.evt', (p) => seen.push(p))
    sock.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"x.evt","par'))
    sock.emit('data', Buffer.from('ams":{"n":1}}\n{"jsonrpc":"2.0","method":"x.evt","params":{"n":2}}\n'))
    expect(seen).toEqual([{ n: 1 }, { n: 2 }])
  })

  test('close() rejects pending calls', async () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const p = c.call('never-responds')
    sock.emit('close')
    await expect(p).rejects.toThrow(/closed/)
  })
})
