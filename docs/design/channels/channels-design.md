# Channels Design

> External messaging integrations for GLM Code — interact with an agent from Telegram, WeChat, and more.
>
> User documentation: [Channels Overview](../../users/features/channels/overview.md).

## Overview

A **channel** connects an external messaging platform to a GLM Code agent. Configured in `settings.json`, managed via `glm channel` subcommands, multi-user (each user gets an isolated ACP session).

## Architecture

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    Platform API        │        Channel Service              │
│ User A   │◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Platform   │    │  ACP Bridge  │  │
│ User B   │                        │  │ Adapter    │    │  (shared)    │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connect  │    │  - spawns    │  │
                                    │  │ - receive  │    │    glm-code │  │
                                    │  │ - send     │    │  - manages   │  │
                                    │  │            │    │    sessions  │  │
                                    │  └─────┬──────┘    └──────┬───────┘  │
                                    │        │                  │          │
                                    │        ▼                  ▼          │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │  SenderGate · GroupGate         │ │
                                    │  │  SessionRouter · ChannelBase    │ │
                                    │  └─────────────────────────────────┘ │
                                    └─────────────────────────────────────┘
                                                     │
                                                     │ stdio (ACP ndjson)
                                                     ▼
                                    ┌─────────────────────────────────────┐
                                    │        glm-code --acp              │
                                    │   Session A (user alice, id: "abc") │
                                    │   Session B (user bob,   id: "def") │
                                    └─────────────────────────────────────┘
```

**Platform Adapter** — connects to external API, translates messages to/from Envelopes. **ACP Bridge** — spawns `glm-code --acp`, manages sessions, emits `textChunk`/`toolCall`/`disconnected` events. **Session Router** — maps senders to ACP sessions via namespaced keys (`<channel>:<sender>`). **Sender Gate** / **Group Gate** — access control (allowlist / pairing / open) and mention gating. **Channel Base** — abstract base with Template Method pattern: plugins override `connect`, `sendMessage`, `disconnect`. **Channel Registry** — `Map<string, ChannelPlugin>` with collision detection.

### Envelope

Normalized message format all platforms convert to:

- **Identity**: `senderId`, `senderName`, `chatId`, `channelName`
- **Content**: `text`, optional `imageBase64`/`imageMimeType`, optional `referencedText`
- **Context**: `isGroup`, `isMentioned`, `isReplyToBot`, optional `threadId`

Plugin responsibilities: `senderId` must be stable/unique; `chatId` must distinguish DMs from groups; boolean flags must be accurate for gate logic; @mentions stripped from `text`.

### Message Flow

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

Slash commands (`/clear`, `/help`, `/status`) are handled in ChannelBase before reaching the agent.

### Sessions

One `glm-code --acp` process with multiple ACP sessions. Scope per channel: **`user`** (default), **`thread`**, or **`single`**. Routing keys namespaced as `<channelName>:<key>`.

### Error Handling

- **Connection failures** — logged; service continues if at least one channel connects
- **Bridge crashes** — exponential backoff (max 3 retries), `setBridge()` on all channels, session restore
- **Session serialization** — per-session promise chains prevent concurrent prompt collisions

## Plugin System

The architecture is extensible — new adapters (including third-party) can be added without modifying core. Built-in channels use the same plugin interface (dogfooding).

### Plugin Contract

A `ChannelPlugin` declares `channelType`, `displayName`, `requiredConfigFields`, and a `createChannel()` factory. Plugins implement three methods:

| Method                      | Responsibility                                    |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | Connect to platform and register message handlers |
| `sendMessage(chatId, text)` | Format and deliver agent response                 |
| `disconnect()`              | Clean up on shutdown                              |

On inbound messages, plugins build an `Envelope` and call `this.handleInbound(envelope)` — the base class handles the rest: access control, group gating, pairing, session routing, prompt serialization, slash commands, instructions injection, reply context, and crash recovery.

### Extension Points

- Custom slash commands via `registerCommand()`
- Working indicators by wrapping `handleInbound()` with typing/reaction display
- Tool call hooks via `onToolCall()`
- Media handling by attaching to Envelope before `handleInbound()`

### Discovery & Loading

External plugins are **extensions** managed by `ExtensionManager`, declared in `glm-extension.json`:

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  }
}
```

Loading sequence at `glm channel start`: load settings → register built-ins → scan extensions → dynamic import + validate → register (reject collisions) → validate config → `createChannel()` → `connect()`.

Plugins run in-process (no sandbox), same trust model as npm dependencies.

## Configuration

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // env var reference
      "senderPolicy": "allowlist", // allowlist | pairing | open
      "allowedUsers": ["123456"],
      "sessionScope": "user", // user | thread | single
      "cwd": "/path/to/project",
      "model": "glm-5",
      "instructions": "Keep responses short.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

Auth is plugin-specific: static token (Telegram), app credentials (DingTalk), QR code login (WeChat), proxy token (TMCP).

## CLI Commands

```bash
# Channels
glm channel start [name]                     # start all or one channel
glm channel stop                             # stop running service
glm channel status                           # show channels, sessions, uptime
glm channel pairing list <ch>                # pending pairing requests
glm channel pairing approve <ch> <code>      # approve a request

# Extensions
glm extensions install <path-or-package>     # install
glm extensions link <local-path>             # symlink for dev
glm extensions list                          # show installed
glm extensions remove <name>                 # uninstall
```

## Package Structure

```
packages/channels/
├── base/                    # @glm-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP process lifecycle, session management
│       ├── SessionRouter.ts # sender ↔ session mapping, persistence
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # group chat policy + mention gating
│       ├── PairingStore.ts  # pairing code generation + approval
│       ├── ChannelBase.ts   # abstract base: routing, slash commands
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @glm-code/channel-telegram
├── weixin/                  # @glm-code/channel-weixin
└── dingtalk/                # @glm-code/channel-dingtalk
```

## Future Work

### Safety & Group Chat

- **Per-group tool restrictions** — `tools`/`toolsBySender` deny/allow lists per group
- **Group context history** — ring buffer of recent skipped messages, prepended on @mention
- **Regex mention patterns** — fallback `mentionPatterns` for unreliable @mention metadata
- **Per-group instructions** — `instructions` field on `GroupConfig` for per-group personas
- **`/activation` command** — runtime toggle for `requireMention`, persisted to disk

### Operational Tooling

- **`glm channel doctor`** — config validation, env vars, bot tokens, network checks
- **`glm channel status --probe`** — real connectivity checks per channel

### Platform Expansion

- **Discord** — Bot API + Gateway, servers/channels/DMs/threads
- **Slack** — Bolt SDK, Socket Mode, workspaces/channels/DMs/threads

### Multi-Agent

- **Multi-agent routing** — multiple agents with bindings per channel/group/user
- **Broadcast groups** — multiple agents respond to the same message

### Plugin Ecosystem

- **Community plugin template** — `create-glm-channel` scaffolding tool
- **Plugin registry/discovery** — `glm extensions search`, version compatibility
