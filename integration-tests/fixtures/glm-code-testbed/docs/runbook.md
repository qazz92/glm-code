# Runbook

## Validate the project

```bash
npm run check
```

## Common GLM Code tasks

- Summarize the codebase.
- Add a field to the task model.
- Fix a failing test.
- Search for all references to task status.
- Call the local MCP server.
- Confirm ignored files remain ignored.

## Safety expectations

Do not inspect or edit `secrets/`, `build/`, or `*.secret` files. They exist only to validate ignore behavior.
