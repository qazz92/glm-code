import pino from 'pino'

export function createLogger(component: string, opts: { level?: string; file?: string } = {}) {
  const level = opts.level ?? process.env.GLM_LOG ?? 'info'
  return pino({
    name: `glm:${component}`,
    level,
    base: undefined,
    redact: { paths: ['*.apiKey', '*.token', 'Authorization'], remove: true },
    transport: opts.file
      ? { target: 'pino/file', options: { destination: opts.file, mkdir: true } }
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
  })
}

export type Logger = ReturnType<typeof createLogger>
