# GLM Code Testbed

This fixture is a small but realistic project for end-to-end GLM Code dogfooding. It is intentionally dependency-light so it can be copied into a temp directory and exercised by the CLI, SDK, IDE companion, MCP, file editing, shell execution, ignore handling, slash commands, and test-repair flows.

## What it covers

| Surface                 | Files / scenario                                                   |
| ----------------------- | ------------------------------------------------------------------ |
| File read/write/edit    | `src/taskStore.mjs`, `docs/product.md`, `data/tasks.json`          |
| Search/glob/read-many   | nested `src/`, `docs/`, `py/`, `config/` files                     |
| Shell/test execution    | `npm run check`, `npm test`, `npm run lint`                        |
| Python project handling | `py/glm_code_testbed/text_stats.py`, `py/tests/test_text_stats.py` |
| MCP server config       | `.glm/settings.json`, `mcp/testbed-mcp-server.cjs`                 |
| Project slash commands  | `.glm/commands/testbed-audit.md`, `.glm/commands/testbed-fix.md`   |
| Ignore rules            | `.glmignore`, `.gitignore`, `secrets/`, `build/`                   |
| Structured output tasks | `scenarios/expected-outcomes.json`                                 |

## Quick check

```bash
npm run check
```

No install step is required. The default checks use only Node.js built-ins and Python standard-library modules when `python3` is available.

## Dogfood prompts

Use these from the fixture root after configuring auth:

```bash
glm -p "Read this project, run its checks, and summarize the architecture."
glm -p "Use /testbed-audit to inspect the project and report risks."
glm -p "Add a dueDate field to tasks, update tests and docs, then run npm run check."
glm -p "Call the MCP tool testbed_echo with message 'hello testbed', then explain the result."
glm -p "Verify .glmignore prevents reading secrets/private-notes.secret."
```

For interactive testing, open the project and try `/help`, `/tools`, `/mcp`, `/memory`, `/model`, `/auth`, local slash commands, and multi-turn edit/test loops.

## Expected baseline

`npm run check` should pass on a clean copy. Feature-change prompts should modify source/tests/docs and keep the check green.
