# GLM Code Extensions

GLM Code extensions package prompts, MCP servers, subagents, skills and custom commands into a familiar and user-friendly format. With extensions, you can expand the capabilities of GLM Code and share those capabilities with others. They are designed to be easily installable and shareable.

Extensions and plugins from [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) and [Claude Code Marketplace](https://claudemarketplaces.com/) can be directly installed into GLM Code. This cross-platform compatibility gives you access to a rich ecosystem of extensions and plugins, dramatically expanding GLM Code's capabilities without requiring extension authors to maintain separate versions.

## Extension management

We offer a suite of extension management tools using both `glm extensions` CLI commands and `/extensions` slash commands within the interactive CLI.

### Runtime Extension Management (Slash Commands)

You can manage extensions at runtime within the interactive CLI using `/extensions` slash commands. These commands support hot-reloading, meaning changes take effect immediately without restarting the application.

| Command                               | Description                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` or `/extensions manage` | Manage all installed extensions                                              |
| `/extensions install <source>`        | Install an extension from a git URL, local path, npm package, or marketplace |
| `/extensions explore [source]`        | Open extensions source page(Gemini or ClaudeCode) in your browser            |

### CLI Extension Management

You can also manage extensions using `glm extensions` CLI commands. Note that changes made via CLI commands will be reflected in active CLI sessions on restart.

### Installing an extension

You can install an extension using `glm extensions install` from multiple sources:

#### From Claude Code Marketplace

GLM Code also supports plugins from the [Claude Code Marketplace](https://claudemarketplaces.com/). Install from a marketplace and choose a plugin:

```bash
glm extensions install <marketplace-name>
# or
glm extensions install <marketplace-github-url>
```

If you want to install a specific plugin, you can use the format with plugin name:

```bash
glm extensions install <marketplace-name>:<plugin-name>
# or
glm extensions install <marketplace-github-url>:<plugin-name>
```

For example, to install the `prompts.chat` plugin from the [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) marketplace:

```bash
glm extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
glm extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude plugins are automatically converted to GLM Code format during installation:

- `claude-plugin.json` is converted to `glm-extension.json`
- Agent configurations are converted to GLM subagent format
- Skill configurations are converted to GLM skill format
- Tool mappings are automatically handled

You can quickly browse available extensions from different marketplaces using the `/extensions explore` command:

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

This command opens the respective marketplace in your default browser, allowing you to discover new extensions to enhance your GLM Code experience.

> **Cross-Platform Compatibility**: This allows you to leverage the rich extension ecosystems from both Gemini CLI and Claude Code, dramatically expanding the available functionality for GLM Code users.

#### From Gemini CLI Extensions

GLM Code fully supports extensions from the [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Simply install them using the git URL:

```bash
glm extensions install <gemini-cli-extension-github-url>
# or
glm extensions install <owner>/<repo>
```

Gemini extensions are automatically converted to GLM Code format during installation:

- `gemini-extension.json` is converted to `glm-extension.json`
- TOML command files are automatically migrated to Markdown format
- MCP servers, context files, and settings are preserved

#### From npm Registry

GLM Code supports installing extensions from npm registries using scoped package names. This is ideal for teams with private registries that already have auth, versioning, and publishing infrastructure in place.

```bash
# Install the latest version
glm extensions install @scope/my-extension

# Install a specific version
glm extensions install @scope/my-extension@1.2.0

# Install from a custom registry
glm extensions install @scope/my-extension --registry https://your-registry.com
```

Only scoped packages (`@scope/package-name`) are supported to avoid ambiguity with the `owner/repo` GitHub shorthand format.

**Registry resolution** follows this priority:

1. `--registry` CLI flag (explicit override)
2. Scoped registry from `.npmrc` (e.g. `@scope:registry=https://...`)
3. Default registry from `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**Authentication** is handled automatically via the `NPM_TOKEN` environment variable or registry-specific `_authToken` entries in your `.npmrc` file.

> **Note:** npm extensions must include a `glm-extension.json` file at the package root, following the same format as any other GLM Code extension. See [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry) for packaging details.

#### From Git Repository

```bash
glm extensions install https://github.com/github/github-mcp-server
```

This will install the github mcp server extension.

#### From Local Path

```bash
glm extensions install /path/to/your/extension
```

Note that we create a copy of the installed extension, so you will need to run `glm extensions update` to pull in changes from both locally-defined extensions and those on GitHub.

### Uninstalling an extension

To uninstall, run `glm extensions uninstall extension-name`, so, in the case of the install example:

```
glm extensions uninstall glm-cli-security
```

### Disabling an extension

Extensions are, by default, enabled across all workspaces. You can disable an extension entirely or for specific workspace.

For example, `glm extensions disable extension-name` will disable the extension at the user level, so it will be disabled everywhere. `glm extensions disable extension-name --scope=workspace` will only disable the extension in the current workspace.

### Enabling an extension

You can enable extensions using `glm extensions enable extension-name`. You can also enable an extension for a specific workspace using `glm extensions enable extension-name --scope=workspace` from within that workspace.

This is useful if you have an extension disabled at the top-level and only enabled in specific places.

### Updating an extension

For extensions installed from a local path, a git repository, or an npm registry, you can explicitly update to the latest version with `glm extensions update extension-name`. For npm extensions installed without a version pin (e.g. `@scope/pkg`), updates check the `latest` dist-tag. For those installed with a specific dist-tag (e.g. `@scope/pkg@beta`), updates track that tag. Extensions pinned to an exact version (e.g. `@scope/pkg@1.2.0`) are always considered up-to-date.

You can update all extensions with:

```
glm extensions update --all
```

## How it works

On startup, GLM Code looks for extensions in `<home>/.glm/extensions`

Extensions exist as a directory that contains a `glm-extension.json` file. For example:

`<home>/.glm/extensions/my-extension/glm-extension.json`

### `glm-extension.json`

The `glm-extension.json` file contains the configuration for the extension. The file has the following structure:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  },
  "contextFileName": "GLM.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: The name of the extension. This is used to uniquely identify the extension and for conflict resolution when extension commands have the same name as user or project commands. The name should be lowercase or numbers and use dashes instead of underscores or spaces. This is how users will refer to your extension in the CLI. Note that we expect this name to match the extension directory name.
- `version`: The version of the extension.
- `mcpServers`: A map of MCP servers to configure. The key is the name of the server, and the value is the server configuration. These servers will be loaded on startup just like MCP servers configured in a [`settings.json` file](./cli/configuration.md). If both an extension and a `settings.json` file configure an MCP server with the same name, the server defined in the `settings.json` file takes precedence.
  - Note that all MCP server configuration options are supported except for `trust`.
- `channels`: A map of custom channel adapters. The key is the channel type name, and the value has an `entry` (path to compiled JS entry point) and optional `displayName`. The entry point must export a `plugin` object conforming to the `ChannelPlugin` interface. See [Channel Plugins](../features/channels/plugins) for a full guide.
- `contextFileName`: The name of the file that contains the context for the extension. This will be used to load the context from the extension directory. If this property is not used but a `GLM.md` file is present in your extension directory, then that file will be loaded.
- `commands`: The directory containing custom commands (default: `commands`). Commands are `.md` files that define prompts.
- `skills`: The directory containing custom skills (default: `skills`). Skills are discovered automatically and become available via the `/skills` command.
- `agents`: The directory containing custom subagents (default: `agents`). Subagents are `.yaml` or `.md` files that define specialized AI assistants.
- `settings`: An array of settings that the extension requires. When installing, users will be prompted to provide values for these settings. The values are stored securely and passed to MCP servers as environment variables.
  - Each setting has the following properties:
    - `name`: Display name for the setting
    - `description`: A description of what this setting is used for
    - `envVar`: The environment variable name that will be set
    - `sensitive`: Boolean indicating if the value should be hidden (e.g., API keys, passwords)

### Managing Extension Settings

Extensions can require configuration through settings (such as API keys or credentials). These settings can be managed using the `glm extensions settings` CLI command:

**Set a setting value:**

```bash
glm extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**List all settings for an extension:**

```bash
glm extensions settings list <extension-name>
```

**View current values (user and workspace):**

```bash
glm extensions settings show <extension-name> <setting-name>
```

**Remove a setting value:**

```bash
glm extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

Settings can be configured at two levels:

- **User level** (default): Settings apply across all projects (`~/.glm/.env`)
- **Workspace level**: Settings apply only to the current project (`.glm/.env`)

Workspace settings take precedence over user settings. Sensitive settings are stored securely and never displayed in plain text.

When GLM Code starts, it loads all the extensions and merges their configurations. If there are any conflicts, the workspace configuration takes precedence.

### Custom commands

Extensions can provide [custom commands](./cli/commands.md#custom-commands) by placing Markdown files in a `commands/` subdirectory within the extension directory. These commands follow the same format as user and project custom commands and use standard naming conventions.

> **Note:** The command format has been updated from TOML to Markdown. TOML files are deprecated but still supported. You can migrate existing TOML commands using the automatic migration prompt that appears when TOML files are detected.

**Example**

An extension named `gcp` with the following structure:

```
.glm/extensions/gcp/
├── glm-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Would provide these commands:

- `/deploy` - Shows as `[gcp] Custom command from deploy.md` in help
- `/gcs:sync` - Shows as `[gcp] Custom command from sync.md` in help

### Custom skills

Extensions can provide custom skills by placing skill files in a `skills/` subdirectory within the extension directory. Each skill should have a `SKILL.md` file with YAML frontmatter defining the skill's name and description.

**Example**

```
.glm/extensions/my-extension/
├── glm-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

The skill will be available via the `/skills` command when the extension is active.

### Custom subagents

Extensions can provide custom subagents by placing agent configuration files in an `agents/` subdirectory within the extension directory. Agents are defined using YAML or Markdown files.

**Example**

```
.glm/extensions/my-extension/
├── glm-extension.json
└── agents/
    └── testing-expert.yaml
```

Extension subagents appear in the subagent manager dialog under "Extension Agents" section.

### Conflict resolution

Extension commands have the lowest precedence. When a conflict occurs with user or project commands:

1. **No conflict**: Extension command uses its natural name (e.g., `/deploy`)
2. **With conflict**: Extension command is renamed with the extension prefix (e.g., `/gcp.deploy`)

For example, if both a user and the `gcp` extension define a `deploy` command:

- `/deploy` - Executes the user's deploy command
- `/gcp.deploy` - Executes the extension's deploy command (marked with `[gcp]` tag)

## Variables

GLM Code extensions allow variable substitution in `glm-extension.json`. This can be useful if e.g., you need the current directory to run an MCP server using `"cwd": "${extensionPath}${/}run.ts"`.

**Supported variables:**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | The fully-qualified path of the extension in the user's filesystem e.g., '/Users/username/.glm/extensions/example-extension'. This will not unwrap symlinks. |
| `${workspacePath}`         | The fully-qualified path of the current workspace.                                                                                                            |
| `${/} or ${pathSeparator}` | The path separator (differs per OS).                                                                                                                          |
