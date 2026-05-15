# Installation Guide for GLM Code with Source Tracking

This guide describes the source-tracking installation scripts for GLM Code.
The scripts prefer standalone release archives and can fall back to npm when a
standalone archive is not available.

## Overview

The installers are intentionally lightweight:

- They try a standalone archive first by default.
- They do not install Node.js, NVM, or any other Node version manager.
- They do not edit npm config or shell profiles.
- They do not start `glm` automatically after installation.
- They store source information in `~/.glm/source.json` or
  `%USERPROFILE%\.glm\source.json` when `--source` is provided.

Standalone archives include a private Node.js runtime, so users do not need a
local Node.js installation on the standalone path. Node.js 20 or newer and npm
are only required when the installer falls back to npm or when
`--method npm` is used.

## Installation Scripts

- Linux/macOS: `install-glm-with-source.sh`
- Windows: `install-glm-with-source.bat`

## Release Artifacts

GitHub releases publish these standalone archives:

- `glm-code-darwin-arm64.tar.gz`
- `glm-code-darwin-x64.tar.gz`
- `glm-code-linux-arm64.tar.gz`
- `glm-code-linux-x64.tar.gz`
- `glm-code-win-x64.zip`
- `SHA256SUMS`

Archive layout:

```text
glm-code/
  bin/glm
  bin/glm.cmd
  lib/cli.js
  node/
  package.json
  README.md
  LICENSE
  manifest.json
```

## Install Methods

The default method is `detect`:

1. Detect the current platform.
2. Try to download and install the matching standalone archive.
3. Verify the archive with `SHA256SUMS`.
4. Fall back to npm if the standalone archive is not available.

You can force a method:

```bash
bash install-glm-with-source.sh --method standalone
bash install-glm-with-source.sh --method npm
```

```bat
install-glm-with-source.bat --method standalone
install-glm-with-source.bat --method npm
```

## Optional Native Modules

The standalone archives bundle GLM Code and a private Node.js runtime. They do
not currently install npm optional native modules such as `node-pty` and
`@teddyzhu/clipboard`. GLM Code is designed to degrade when these optional
modules are absent, but terminal pty behavior and clipboard image support may
not be identical to an npm installation.

Use `--method npm` if you specifically need npm to resolve optional native
modules for the current machine.

## Linux/macOS Usage

```bash
# Default: standalone archive with npm fallback
bash install-glm-with-source.sh

# Record a source value
bash install-glm-with-source.sh --source github

# Use npm explicitly
bash install-glm-with-source.sh --method npm --registry https://registry.npmjs.org

# Use the Aliyun standalone mirror
bash install-glm-with-source.sh --mirror aliyun

# Install an offline archive
# SHA256SUMS must be in the same directory.
bash install-glm-with-source.sh --archive ./glm-code-linux-x64.tar.gz
```

Standalone installs to:

- Runtime: `~/.local/lib/glm-code`
- Shim: `~/.local/bin/glm`

Override with `GLM_INSTALL_ROOT`, `GLM_INSTALL_LIB_PARENT`,
`GLM_INSTALL_LIB_DIR`, or `GLM_INSTALL_BIN_DIR` when needed.

## Windows Usage

```bat
REM Default: standalone archive with npm fallback
install-glm-with-source.bat

REM Record a source value
install-glm-with-source.bat --source github

REM Use npm explicitly
install-glm-with-source.bat --method npm --registry https://registry.npmjs.org

REM Use the Aliyun standalone mirror
install-glm-with-source.bat --mirror aliyun

REM Install an offline archive
REM SHA256SUMS must be in the same directory.
install-glm-with-source.bat --archive glm-code-win-x64.zip
```

Standalone installs to:

- Runtime: `%LOCALAPPDATA%\glm-code\glm-code`
- Shim: `%LOCALAPPDATA%\glm-code\bin\glm.cmd`

Override with `GLM_INSTALL_ROOT`, `GLM_INSTALL_LIB_DIR`, or
`GLM_INSTALL_BIN_DIR` when needed.

Restart the terminal if `glm` is not immediately available on PATH.

## Mirrors and Overrides

Options:

- `--method detect|standalone|npm`
- `--mirror github|aliyun`
- `--base-url URL`
- `--archive PATH`
- `--version VERSION`
- `--registry REGISTRY`
- `--source SOURCE`

Environment variables:

- `GLM_INSTALL_METHOD`
- `GLM_INSTALL_MIRROR`
- `GLM_INSTALL_BASE_URL`
- `GLM_INSTALL_ARCHIVE`
- `GLM_INSTALL_VERSION`
- `GLM_NPM_REGISTRY`

Use `--base-url` for private mirrors. The URL must contain
`glm-code-<target>` archives and `SHA256SUMS` in the same directory. Custom
base URLs must use `https://`.

For Aliyun OSS/CDN, release publishing must upload byte-identical artifacts to
both the versioned directory, for example `v0.16.0/`, and the `latest/`
directory used by the default installer path.

## Supported Source Values

The source value may only contain letters, numbers, dot, underscore, and dash.
Common values are:

- `github`
- `npm`
- `internal`
- `local-build`

## Source Tracking

When `--source` or `-s` is provided, the installer writes:

```json
{
  "source": "github"
}
```

Locations:

- Linux/macOS: `~/.glm/source.json`
- Windows: `%USERPROFILE%\.glm\source.json`

The telemetry logger reads this file when available. Missing, invalid, or
unreadable source files are ignored.

## Manual Installation

If source tracking is not needed and Node.js 20 or newer is already available:

```bash
npm install -g @glm-code/glm-code@latest
```

Homebrew users can also install GLM Code with:

```bash
brew install glm-code
```

## Troubleshooting

### Standalone Archive Missing

In `detect` mode, the installer falls back to npm. In `standalone` mode, install
fails so that automation can detect the missing artifact.

### Node.js Missing or Too Old

This only blocks npm installation. Install or activate Node.js 20 or newer, then
rerun the installer with `--method npm` or let `detect` fall back again.

### npm Missing

Install a Node.js distribution that includes npm, then rerun the installer.

### Permission Errors During npm Install

The installers do not rewrite npm prefix settings. If global npm installation
fails with a permission error, fix the npm global install location or use a
user-owned Node.js installation, then rerun:

```bash
npm install -g @glm-code/glm-code@latest --registry https://registry.npmmirror.com
```

### glm Is Not on PATH After Installation

Restart the terminal first. For standalone installs, add the shim directory:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

For npm installs, add npm's global binary directory. On Linux/macOS this is
usually:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

On Windows standalone installs, add this directory to PATH:

```bat
%LOCALAPPDATA%\glm-code\bin
```
