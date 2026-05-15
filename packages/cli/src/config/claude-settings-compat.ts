/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Claude Code configuration compatibility layer.
 *
 * Reads settings from `.claude/settings.json`, `.claude/settings.local.json`,
 * `.mcp.json`, and `~/.claude.json` — then deep-merges their mcpServers,
 * hooks, and permissions into GLM settings with lower priority (GLM wins on
 * conflict).
 *
 * Priority (highest first):
 *   CLI args
 *   .glm/settings.local.json → .glm/settings.json
 *   .claude/settings.local.json → .claude/settings.json   (read-only compat)
 *   .mcp.json                                                (read-only compat)
 *   ~/.glm/settings.json
 *   ~/.claude.json                                           (read-only compat)
 *   ~/.claude/settings.json                                  (read-only compat)
 *   system defaults
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { createDebugLogger } from '@glm-code/core';
import stripJsonComments from 'strip-json-comments';

const debugLogger = createDebugLogger('CLAUDE_COMPAT');

/** Subset of Claude settings we care about merging. */
export interface ClaudeSettings {
  mcpServers?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Result of reading all Claude-compatible config sources. */
export interface ClaudeCompatResult {
  /** Merged Claude settings (all sources combined, Claude-priority order). */
  settings: ClaudeSettings;
  /** Paths that were found and read. */
  sources: string[];
}

/**
 * Reads a JSON file with comment stripping. Returns null if file doesn't exist
 * or can't be parsed.
 */
function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(stripJsonComments(content));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (e) {
    debugLogger.warn(`Failed to read/parse ${filePath}: ${e}`);
    return null;
  }
}

/**
 * Deep-merges source into target. For object values, recurses. For arrays and
 * scalars, source wins (last-writer-wins). Neither input is mutated.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      isPlainObject(sourceVal) &&
      isPlainObject(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Reads all Claude-compatible configuration sources for a given project.
 *
 * Sources read (in merge order, later wins):
 *  1. `~/.claude/settings.json`   — global Claude user settings
 *  2. `~/.claude.json`            — legacy global Claude settings
 *  3. `<project>/.mcp.json`       — project MCP servers
 *  4. `<project>/.claude/settings.json`      — project Claude settings
 *  5. `<project>/.claude/settings.local.json` — project local overrides
 *
 * @param projectDir — absolute path to the project root
 */
export function readClaudeSettings(projectDir: string): ClaudeCompatResult {
  const homeDir = homedir();
  const sources: string[] = [];
  let merged: ClaudeSettings = {};

  // 1. ~/.claude/settings.json (global user settings)
  const globalClaudeSettingsPath = path.join(homeDir, '.claude', 'settings.json');
  const globalClaude = readJsonFile(globalClaudeSettingsPath);
  if (globalClaude) {
    merged = deepMerge(merged, globalClaude) as ClaudeSettings;
    sources.push(globalClaudeSettingsPath);
    debugLogger.debug(`Read global Claude settings: ${globalClaudeSettingsPath}`);
  }

  // 2. ~/.claude.json (legacy global settings, lower priority than .claude/settings.json)
  const legacyGlobalPath = path.join(homeDir, '.claude.json');
  const legacyGlobal = readJsonFile(legacyGlobalPath);
  if (legacyGlobal) {
    // Only merge the mcpServers key from .claude.json — that's the main payload
    const claudeJsonServers = legacyGlobal['mcpServers'];
    if (isPlainObject(claudeJsonServers)) {
      merged = deepMerge(merged, { mcpServers: claudeJsonServers }) as ClaudeSettings;
      sources.push(legacyGlobalPath);
      debugLogger.debug(`Read ~/.claude.json mcpServers`);
    }
  }

  // 3. <project>/.mcp.json (project-level MCP servers)
  const mcpJsonPath = path.join(projectDir, '.mcp.json');
  const mcpJson = readJsonFile(mcpJsonPath);
  if (mcpJson) {
    const mcpServers = mcpJson['mcpServers'] ?? mcpJson['servers'];
    if (isPlainObject(mcpServers)) {
      merged = deepMerge(merged, { mcpServers }) as ClaudeSettings;
      sources.push(mcpJsonPath);
      debugLogger.debug(`Read .mcp.json from project`);
    }
  }

  // 4. <project>/.claude/settings.json (project-level Claude settings)
  const projectClaudeSettingsPath = path.join(projectDir, '.claude', 'settings.json');
  const projectClaude = readJsonFile(projectClaudeSettingsPath);
  if (projectClaude) {
    merged = deepMerge(merged, projectClaude) as ClaudeSettings;
    sources.push(projectClaudeSettingsPath);
    debugLogger.debug(`Read project Claude settings: ${projectClaudeSettingsPath}`);
  }

  // 5. <project>/.claude/settings.local.json (project local overrides)
  const projectClaudeLocalPath = path.join(projectDir, '.claude', 'settings.local.json');
  const projectClaudeLocal = readJsonFile(projectClaudeLocalPath);
  if (projectClaudeLocal) {
    merged = deepMerge(merged, projectClaudeLocal) as ClaudeSettings;
    sources.push(projectClaudeLocalPath);
    debugLogger.debug(`Read project Claude local settings: ${projectClaudeLocalPath}`);
  }

  if (sources.length > 0) {
    debugLogger.debug(
      `Claude compat: loaded ${sources.length} source(s): ${sources.join(', ')}`,
    );
  }

  return { settings: merged, sources };
}

/**
 * Deep-merges Claude compat settings into GLM settings.
 *
 * For each of `mcpServers`, `hooks`, and `permissions`, the Claude values are
 * **merged under** the GLM values — so GLM entries take priority and cannot be
 * overridden by Claude sources. New Claude entries that don't exist in GLM
 * settings are added.
 *
 * @param glmSettings  — already-resolved GLM settings (mutated in place and returned)
 * @param claudeSettings — Claude compat settings from `readClaudeSettings()`
 * @returns the merged settings (same reference as `glmSettings`)
 */
export function mergeClaudeCompat(
  glmSettings: Record<string, unknown>,
  claudeSettings: ClaudeSettings,
): Record<string, unknown> {
  if (!claudeSettings || Object.keys(claudeSettings).length === 0) {
    return glmSettings;
  }

  // Deep-merge keys that support merging
  const mergeKeys = ['mcpServers', 'hooks', 'permissions'] as const;

  for (const key of mergeKeys) {
    const claudeVal = claudeSettings[key];
    if (!isPlainObject(claudeVal)) {
      continue;
    }

    const glmVal = glmSettings[key];
    if (isPlainObject(glmVal)) {
      // GLM takes priority: merge Claude under GLM so GLM entries win on conflict
      glmSettings[key] = deepMerge(
        claudeVal as Record<string, unknown>,
        glmVal as Record<string, unknown>,
      );
    } else {
      // No GLM value — just set from Claude
      glmSettings[key] = structuredClone(claudeVal);
    }

    debugLogger.debug(`Merged Claude compat '${key}' into GLM settings`);
  }

  return glmSettings;
}
