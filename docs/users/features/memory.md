# Memory

Every GLM Code session starts with a fresh context window. Two mechanisms carry knowledge across sessions so you don't have to re-explain yourself every time:

- **GLM.md** — instructions _you_ write once and GLM reads every session
- **Auto-memory** — notes GLM writes itself based on what it learns from you

---

## GLM.md: your instructions to GLM

GLM.md is a plain text file where you write things GLM should always know about your project or your preferences. Think of it as a permanent briefing that loads at the start of every conversation.

### What to put in GLM.md

Add things you'd otherwise have to repeat every session:

- Build and test commands (`npm run test`, `make build`)
- Coding conventions your team follows ("all new files must have JSDoc comments")
- Architectural decisions ("we use the repository pattern, never call the database directly from controllers")
- Personal preferences ("always use pnpm, not npm")

Don't include things GLM can figure out by reading your code. GLM.md works best when it's short and specific — the longer it gets, the less reliably GLM follows it.

### Where to create GLM.md

| File                          | Who it applies to                             |
| ----------------------------- | --------------------------------------------- |
| `~/.glm/GLM.md`             | You, across all your projects                 |
| `GLM.md` in the project root | Your whole team (commit it to source control) |

You can have both. GLM loads all GLM.md files it finds when you start a session — your personal one plus any in the project.

If your repository already has an `AGENTS.md` file for other AI tools, GLM reads that too. No need to duplicate instructions.

### Generate one automatically with `/init`

Run `/init` and GLM will analyze your codebase to create a starter GLM.md with build commands, test instructions, and conventions it finds. If one already exists, it suggests additions instead of overwriting.

### Reference other files

You can point GLM.md at other files so GLM reads them too:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Use `@path/to/file` anywhere in GLM.md. Relative paths resolve from the GLM.md file itself.

---

## Auto-memory: what GLM learns about you

Auto-memory runs in the background. After each of your conversations, GLM quietly saves useful things it learned — your preferences, feedback you gave, project context — so it can use them in future sessions without you repeating yourself.

This is different from GLM.md: you don't write it, GLM does.

### What GLM saves

GLM looks for four kinds of things worth remembering:

| What                    | Examples                                                 |
| ----------------------- | -------------------------------------------------------- |
| **About you**           | Your role, background, how you like to work              |
| **Your feedback**       | Corrections you made, approaches you confirmed           |
| **Project context**     | Ongoing work, decisions, goals not obvious from the code |
| **External references** | Dashboards, ticket trackers, docs links you mentioned    |

GLM doesn't save everything — only things that would actually be useful next time.

### Where it's stored

Auto-memory files live at `~/.glm/projects/<project>/memory/`. All branches and worktrees of the same repository share the same memory folder, so what GLM learns in one branch is available in others.

Everything saved is plain markdown — you can open, edit, or delete any file at any time.

### Periodic cleanup

GLM periodically goes through its saved memories to remove duplicates and clean up outdated entries. This runs automatically in the background once a day after enough sessions have accumulated. You can trigger it manually with `/dream` if you want it to run now.

While cleanup is running, **✦ dreaming** appears in the corner of the screen. Your session continues normally.

### Turning it on or off

Auto-memory is on by default. To toggle it, open `/memory` and use the switches at the top. You can turn off just the automatic saving, just the periodic cleanup, or both.

You can also set them in `~/.glm/settings.json` (applies to all projects) or `.glm/settings.json` (this project only):

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

---

## Commands

### `/memory`

Opens the Memory panel. From here you can:

- Turn auto-memory saving on or off
- Turn periodic cleanup (dream) on or off
- Open your personal GLM.md (`~/.glm/GLM.md`)
- Open the project GLM.md
- Browse the auto-memory folder

### `/init`

Generates a starter GLM.md for your project. GLM reads your codebase and fills in build commands, test instructions, and conventions it discovers.

### `/remember <text>`

Immediately saves something to auto-memory without waiting for GLM to pick it up automatically:

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Removes auto-memory entries that match your description:

```
/forget old workaround for the login bug
```

### `/dream`

Runs the memory cleanup now instead of waiting for the automatic schedule:

```
/dream
```

---

## Troubleshooting

### GLM isn't following my GLM.md

Open `/memory` to see which files are loaded. If your file isn't listed, GLM can't see it — make sure it's in the project root or `~/.glm/`.

Instructions work better when they're specific:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

If you have multiple GLM.md files with conflicting instructions, GLM may behave inconsistently. Review them and remove any contradictions.

### I want to see what GLM has saved

Run `/memory` and select **Open auto-memory folder**. All saved memories are readable markdown files you can browse, edit, or delete.

### GLM keeps forgetting things

If auto-memory is on but GLM doesn't seem to remember things across sessions, try running `/dream` to force a cleanup pass. Also check `/memory` to confirm both toggles are enabled.

For things you always want GLM to remember, add them to GLM.md instead — auto-memory is best-effort, GLM.md is guaranteed.
