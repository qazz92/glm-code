import { Daemon } from '@glm/core'
// Side-effect: registers the 'llm-router' LoaderHub subsystem
import '@glm/llm-router'
const d = new Daemon()
d.start().catch((e) => { console.error(e); process.exit(1) })
