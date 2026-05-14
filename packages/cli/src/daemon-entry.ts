import { Daemon } from '@glm/core'
const d = new Daemon()
d.start().catch((e) => { console.error(e); process.exit(1) })
