/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

/**
 * Expands tilde and resolves relative paths to absolute. Mirrors
 * `Storage.resolvePath` in packages/core (kept in sync — these scripts run
 * before the core bundle is built and cannot import from it).
 */
export function resolvePath(dir) {
  let resolved = dir;
  if (
    resolved === '~' ||
    resolved.startsWith('~/') ||
    resolved.startsWith('~\\')
  ) {
    const segments =
      resolved === '~'
        ? []
        : resolved
            .slice(2)
            .split(/[/\\]+/)
            .filter(Boolean);
    resolved = path.join(os.homedir(), ...segments);
  }
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(resolved);
  }
  return resolved;
}

/**
 * Pre-resolves GLM_HOME / GLM_RUNTIME_DIR from home-scoped `.env` files so
 * that helper scripts (sandbox launcher, telemetry) agree with the main CLI's
 * `preResolveHomeEnvOverrides`. Without this, the CLI may route to a custom
 * config dir via `~/.env` while these scripts still read `~/.glm/...`,
 * splitting global state across two locations.
 *
 * Project `.env` files are deliberately excluded — only home-scoped files are
 * consulted so a project repo can never redirect global state through this
 * back door (consistent with `PROJECT_ENV_HARDCODED_EXCLUSIONS` in the CLI).
 *
 * Idempotent: safe to call from multiple scripts in the same process.
 */
export function bootstrapHomeEnv() {
  if (process.env.GLM_HOME && process.env.GLM_RUNTIME_DIR) {
    return;
  }
  const initialGLMHome = process.env.GLM_HOME;
  const initialGLMDir = initialGLMHome
    ? resolvePath(initialGLMHome)
    : path.join(os.homedir(), '.glm');
  const candidates = [path.join(initialGLMDir, '.env')];
  if (!initialGLMHome) {
    candidates.push(path.join(os.homedir(), '.env'));
  }
  for (const candidate of candidates) {
    readEnvInto(candidate);
  }

  // If GLM_HOME was just discovered, also read <new GLM_HOME>/.env so
  // GLM_RUNTIME_DIR can be sourced from there (mirrors the VS Code
  // companion's bootstrapHomeEnvOverrides).
  const discoveredGLMHome = process.env.GLM_HOME;
  if (discoveredGLMHome && discoveredGLMHome !== initialGLMHome) {
    const discoveredDir = resolvePath(discoveredGLMHome);
    if (discoveredDir !== initialGLMDir) {
      readEnvInto(path.join(discoveredDir, '.env'));
    }
  }
}

function readEnvInto(file) {
  if (!existsSync(file)) {
    return;
  }
  try {
    const parsed = dotenv.parse(readFileSync(file, 'utf-8'));
    for (const key of ['GLM_HOME', 'GLM_RUNTIME_DIR']) {
      if (parsed[key] && !Object.hasOwn(process.env, key)) {
        process.env[key] = parsed[key];
      }
    }
  } catch {
    // Match dotenv's quiet-mode behavior used elsewhere.
  }
}
