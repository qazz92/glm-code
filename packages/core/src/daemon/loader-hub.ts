import type { Daemon } from './daemon.js'

export type SubsystemInit = (daemon: Daemon) => void | Promise<void>

class LoaderHubImpl {
  private subsystems: Array<{ name: string; init: SubsystemInit }> = []

  registerSubsystem(name: string, init: SubsystemInit): void {
    this.subsystems.push({ name, init })
  }

  async runAll(daemon: Daemon): Promise<void> {
    for (const { name, init } of this.subsystems) {
      try { await init(daemon) }
      catch (e) { throw new Error(`LoaderHub subsystem '${name}' failed: ${(e as Error).message}`) }
    }
  }

  reset(): void { this.subsystems = [] }
}

export const LoaderHub = new LoaderHubImpl()
