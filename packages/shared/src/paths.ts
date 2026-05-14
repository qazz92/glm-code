import path from 'node:path'
import os from 'node:os'

export interface GlmPaths {
  root: string
  socket: string
  pid: string
  log: string
  sessionsDir: string
  quotaDb: string
  configFile: string
  agentsMd: string
}

export interface ResolveOpts {
  home?: string
  env?: NodeJS.ProcessEnv
}

export function resolvePaths(opts: ResolveOpts = {}): GlmPaths {
  const env = opts.env ?? process.env
  const home = opts.home ?? os.homedir()
  const root = env.GLM_HOME ?? path.join(home, '.glm')
  return {
    root,
    socket: path.join(root, 'daemon.sock'),
    pid: path.join(root, 'daemon.pid'),
    log: path.join(root, 'daemon.log'),
    sessionsDir: path.join(root, 'sessions'),
    quotaDb: path.join(root, 'quota.db'),
    configFile: path.join(root, 'config.json'),
    agentsMd: path.join(root, 'AGENTS.md'),
  }
}
