import type { Server, Socket } from 'node:net'
import { resolvePaths, ulid } from '@glm/shared'
import { createLogger, type Logger } from '../log.js'
import { openDb } from '../storage/db.js'
import { runMigrations } from '../storage/migrations.js'
import { SessionRepo } from '../storage/session-repo.js'
import { RpcServer, pingHandler } from '../rpc/index.js'
import { makeSessionHandlers } from '../rpc/methods/session.js'
import { messageSendStub } from '../rpc/methods/chat.js'
import { createSocketServer, closeSocketServer } from './socket.js'
import { writePid, removePid, readPid, isPidAlive } from './pid.js'
import { LoaderHub } from './loader-hub.js'
import type { Database } from 'better-sqlite3'

export interface DaemonOpts { home?: string }

export class Daemon {
  private paths = resolvePaths({ home: undefined })
  private log: Logger
  private db?: Database
  private repo?: SessionRepo
  private rpc?: RpcServer
  private socketServer?: Server
  private startedAt?: Date

  constructor(opts: DaemonOpts = {}) {
    if (opts.home) this.paths = resolvePaths({ home: opts.home })
    this.log = createLogger('daemon', { file: this.paths.log })
  }

  async start(): Promise<void> {
    const existing = readPid(this.paths.pid)
    if (existing) {
      if (isPidAlive(existing)) {
        throw new Error(`Daemon already running (PID ${existing}). Use 'glm daemon stop' first.`)
      } else {
        this.log.warn({ stalePid: existing }, 'removing stale PID file')
        removePid(this.paths.pid)
      }
    }
    this.db = openDb(`${this.paths.root}/registry.db`)
    runMigrations(this.db)
    this.repo = new SessionRepo(this.db)
    this.rpc = new RpcServer(this.log)

    this.rpc.on('ping', pingHandler)
    for (const [name, h] of Object.entries(makeSessionHandlers(this.repo))) this.rpc.on(name, h)
    this.rpc.on('message.send', messageSendStub)
    this.rpc.on('daemon.status', async () => ({
      pid: process.pid,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      version: '0.1.0-alpha.1'
    }))
    this.rpc.on('daemon.shutdown', async () => { setImmediate(() => this.stop()); return { ok: true } })
    this.rpc.on('dashboard.subscribe', async () => ({
      ok: true,
      streamId: ulid(),
      version: 'stub-p1'
    }))

    await LoaderHub.runAll(this)

    this.socketServer = createSocketServer({
      path: this.paths.socket,
      log: this.log,
      onConnection: (sock: Socket) => this.rpc!.attach(sock, { clientId: ulid() })
    })

    writePid(this.paths.pid, process.pid)
    this.startedAt = new Date()
    this.log.info({ pid: process.pid, socket: this.paths.socket }, 'daemon started')

    process.on('SIGTERM', () => this.stop())
    process.on('SIGINT',  () => this.stop())
  }

  async stop(): Promise<void> {
    this.log.info('daemon stopping')
    if (this.socketServer) await closeSocketServer(this.socketServer, this.paths.socket)
    if (this.db) this.db.close()
    removePid(this.paths.pid)
    this.log.info('daemon stopped')
    process.exit(0)
  }
}
