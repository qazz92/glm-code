# GLM Code

<div align="center">

**An open-source AI coding agent that lives in your terminal.**

[![License](https://img.shields.io/github/license/qazz92/glm-code.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

</div>

---

## What is GLM Code?

GLM Code is a terminal-first AI agent designed for real-world software engineering. It understands your codebase, automates tedious work, and helps you ship faster — all from the command line.

Built with an orchestrator-driven architecture that classifies tasks by complexity, manages multi-agent fanout, and tracks pipeline phases automatically.

### Key Features

- **Smart Task Classification** — automatically routes prompts as `SMALL`, `MEDIUM`, `LARGE`, or `LONG_HORIZON` with auto-promotion when sessions grow complex
- **7-Action System** — switch between `default`, `smol`, `slow`, `plan`, `designer`, `commit`, and `task` modes, each with tuned model/thinking/temperature presets
- **Multi-Agent Fanout** — decomposes large tasks into parallel sub-agent waves with a 6-phase pipeline (`plan → scaffold → execute → verify → test → review`)
- **Thinking Effort Control** — 7 levels (`off`, `min`, `low`, `medium`, `high`, `xhigh`) with token budget mapping for chain-of-thought reasoning
- **3-Tier Permission System** — tools classified into Tier A (auto-approve), Tier B (workspace auto-approve), Tier C (always confirm) for safe yolo mode
- **Crash Recovery** — full orchestrator state checkpointing with session resumption
- **Hindsight Memory** — auto-injects learned context from previous sessions on first turn
- **Hook System** — extensible hook pipeline with kill switches (`DISABLE_GLM_HOOKS`, `GLM_SKIP_HOOKS`) and a plugin SDK (`defineHook()`)
- **Diff-Aware Edits** — only returns changed hunks instead of full file content for smaller context windows
- **Content-Addressable Snapshots** — SHA-256 deduped before/after tracking for every edit
- **Bidirectional Notifications** — reply daemon for Telegram, Discord, and Slack
- **Process Recycling** — automatic graceful restart at turn boundaries when memory pressure detected

## Architecture

```
User Prompt
    │
    ▼
┌──────────────┐
│  Orchestrator │ ─── Task Classification (regex + LLM)
│              │ ─── Auto-Promotion (step/time thresholds)
│              │ ─── Rate-Limit Aware Model Selection
└──────┬───────┘
       │
       ├── SMALL/MEDIUM ──→ Direct LLM call
       │
       ├── LARGE ─────────→ Fanout (parallel sub-agents)
       │
       └── LONG_HORIZON ──→ 6-Phase Pipeline
                            plan → scaffold → execute → verify → test → review
```

## Packages

| Package                         | Description                                                            |
| ------------------------------- | ---------------------------------------------------------------------- |
| `packages/core`                 | Orchestrator, hooks, permissions, tools, memory, models, notifications |
| `packages/cli`                  | Terminal UI (Ink/React), commands, config, i18n                        |
| `packages/sdk-typescript`       | TypeScript SDK for headless usage                                      |
| `packages/sdk-python`           | Python SDK                                                             |
| `packages/vscode-ide-companion` | VS Code extension                                                      |
| `packages/zed-extension`        | Zed editor extension                                                   |

## Installation

### Prerequisites

- **Node.js** >= 22 (required for Ink 7 + React 19.2)
- **Git** (for version control operations)

### From Source

```bash
git clone https://github.com/qazz92/glm-code.git
cd glm-code
npm install
npm run build
npm run bundle
```

### Quick Install

```bash
npm install -g @glm-code/glm-code@latest
```

## Usage

### Interactive Mode

```bash
cd your-project/
glm
```

### Headless Mode

```bash
cd your-project/
glm -p "Explain the codebase structure"
glm -p "Generate unit tests for src/auth.ts"
```

### Configuration

GLM Code reads settings from `~/.glm/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "glm-5.1",
        "name": "GLM-5.1",
        "baseUrl": "https://api.example.com/v1",
        "envKey": "GLM_API_KEY"
      }
    ]
  },
  "env": {
    "GLM_API_KEY": "your-api-key"
  },
  "model": {
    "name": "glm-5.1"
  }
}
```

### Key Commands (Inside Session)

| Command             | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `/action <name>`    | Switch action mode (default, smol, slow, plan, designer, commit, task) |
| `/thinking <level>` | Set thinking effort (off, min, low, medium, high, xhigh)               |
| `/model`            | Interactive model picker with tab cycling                              |
| `/help`             | Show available commands                                                |
| `/auth`             | Configure authentication                                               |

### Environment Variables

| Variable                     | Description                         |
| ---------------------------- | ----------------------------------- |
| `DISABLE_GLM_HOOKS=1`        | Disable all hook execution          |
| `GLM_SKIP_HOOKS=Name1,Name2` | Skip specific hooks by name         |
| `GLM_HOME`                   | Override default `~/.glm` directory |

## Development

### Build

```bash
npm install        # Install all dependencies
npm run build      # Build all packages
npm run bundle     # Bundle into single dist/cli.js
npm run dev        # Run CLI from TypeScript source (no build needed)
```

### Testing

Tests run per-package:

```bash
cd packages/core && npx vitest run src/path/to/file.test.ts
cd packages/cli && npx vitest run src/path/to/file.test.ts
```

### Linting & Formatting

```bash
npm run lint       # ESLint check
npm run format     # Prettier formatting
npm run typecheck  # TypeScript type checking
npm run preflight  # Full check: clean → format → lint → build → typecheck → test
```

## Project Structure

```
~/.glm/
├── settings.json          # Global settings
├── memory/
│   └── bank/              # Memory bank files (*.md)
├── hooks/                 # User hook plugins
├── agents/                # Custom agent definitions
├── sessions/              # Session transcripts
├── checkpoints/           # Crash recovery snapshots
├── snapshots/             # Content-addressable edit history
│   ├── edits.jsonl        # Edit index
│   └── XX/XXXX...         # SHA-256 deduped blobs
└── mcp/                   # MCP server state
```

## License

[Apache-2.0](./LICENSE)
