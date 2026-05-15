# GLM Code overview

[![@glm-code/glm-code downloads](https://img.shields.io/npm/dw/@glm-code/glm-code.svg)](https://npm-compare.com/@glm-code/glm-code)
[![@glm-code/glm-code version](https://img.shields.io/npm/v/@glm-code/glm-code.svg)](https://www.npmjs.com/package/@glm-code/glm-code)

> Learn about GLM Code, GLM's agentic coding tool that lives in your terminal and helps you turn ideas into code faster than ever before.

## Get started in 30 seconds

### Install GLM Code:

The recommended installer uses a standalone archive when one is available for
your platform. If it falls back to npm, Node.js 20 or later with npm must be
available on PATH.

**Linux / macOS**

```sh
curl -fsSL https://glm-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-glm.sh | bash
```

**Windows**

```cmd
powershell -Command "Invoke-WebRequest 'https://glm-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-glm.bat' -OutFile (Join-Path $env:TEMP 'install-glm.bat'); & (Join-Path $env:TEMP 'install-glm.bat')"
```

> [!note]
>
> It's recommended to restart your terminal after installation if `glm` is not
> immediately available on PATH. If the installation fails, please refer to
> [Manual Installation](./quickstart#manual-installation) in the Quickstart
> guide. For offline installation, download a release archive and run the
> installer with `--archive PATH`; keep `SHA256SUMS` next to the archive.

### Start using GLM Code:

```bash
cd your-project
glm
```

Choose your authentication method — **API Key** or **[Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)** ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) — and follow the prompts to configure. See the API setup guide ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) for step-by-step instructions. Then let's start with understanding your codebase. Try one of these commands:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

You'll be prompted to log in on first use. That's it! [Continue with Quickstart (5 mins) →](./quickstart)

> [!tip]
>
> See [troubleshooting](./support/troubleshooting) if you hit issues.

> [!note]
>
> **New VS Code Extension (Beta)**: Prefer a graphical interface? Our new **VS Code extension** provides an easy-to-use native IDE experience without requiring terminal familiarity. Simply install from the marketplace and start coding with GLM Code directly in your sidebar. Download and install the [GLM Code Companion](https://marketplace.visualstudio.com/items?itemName=glm-code.glm-code-vscode-ide-companion) now.

## What GLM Code does for you

- **Build features from descriptions**: Tell GLM Code what you want to build in plain language. It will make a plan, write the code, and ensure it works.
- **Debug and fix issues**: Describe a bug or paste an error message. GLM Code will analyze your codebase, identify the problem, and implement a fix.
- **Navigate any codebase**: Ask anything about your team's codebase, and get a thoughtful answer back. GLM Code maintains awareness of your entire project structure, can find up-to-date information from the web, and with [MCP](./features/mcp) can pull from external datasources like Google Drive, Figma, and Slack.
- **Automate tedious tasks**: Fix fiddly lint issues, resolve merge conflicts, and write release notes. Do all this in a single command from your developer machines, or automatically in CI.
- **[Followup suggestions](./features/followup-suggestions)**: GLM Code predicts what you want to type next and shows it as ghost text. Press Tab to accept, or just keep typing to dismiss.

## Why developers love GLM Code

- **Works in your terminal**: Not another chat window. Not another IDE. GLM Code meets you where you already work, with the tools you already love.
- **Takes action**: GLM Code can directly edit files, run commands, and create commits. Need more? [MCP](./features/mcp) lets GLM Code read your design docs in Google Drive, update your tickets in Jira, or use _your_ custom developer tooling.
- **Unix philosophy**: GLM Code is composable and scriptable. `tail -f app.log | glm -p "Slack me if you see any anomalies appear in this log stream"` _works_. Your CI can run `glm -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.
