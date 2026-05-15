/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * AGENTS.md cascade resolver — discovers instruction files using a
 * global-first-match + project-findUp strategy.
 *
 * Resolution order:
 *   1. Global: ~/.glm/AGENTS.md → if exists, use it
 *      Else:   ~/.claude/CLAUDE.md → if exists, use it
 *      If neither: no global instructions.
 *   2. Project findUp (from filePath or projectDir):
 *      Walk up from filePath to projectDir.
 *      At each level: check .glm/AGENTS.md, then .claude/CLAUDE.md
 *      First match wins, stop walking.
 *
 * Returns array of file contents to inject.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('INSTRUCTIONS_RESOLVER');

/** Instruction file candidate locations. */
const GLOBAL_CANDIDATES: Array<{ dir: () => string; file: string }> = [
  { dir: () => getGlmHome(), file: 'AGENTS.md' },
  { dir: () => getClaudeHome(), file: 'CLAUDE.md' },
];

const PROJECT_CANDIDATES = ['.glm/AGENTS.md', '.claude/CLAUDE.md'] as const;

function getGlmHome(): string {
  const envDir = process.env['GLM_HOME'];
  if (envDir) return path.resolve(envDir);
  const home = os.homedir();
  return home ? path.join(home, '.glm') : path.join(os.tmpdir(), '.glm');
}

function getClaudeHome(): string {
  const configDir =
    process.env['CLAUDE_CONFIG_DIR'] ||
    process.env['XDG_CONFIG_HOME'] ||
    path.join(os.homedir() || os.tmpdir(), '.claude');
  return configDir;
}

/**
 * Resolve instruction file contents from global + project cascade.
 *
 * @param projectDir - The project root directory.
 * @param filePath - Optional file path to start findUp from.
 *   Defaults to projectDir.
 * @returns Array of resolved file contents, in discovery order
 *   (global first, then project-local).
 */
export async function resolveInstructions(
  projectDir: string,
  filePath?: string,
): Promise<string[]> {
  const results: string[] = [];

  // 1. Global first-match
  const globalContent = await resolveGlobal();
  if (globalContent !== null) {
    results.push(globalContent);
  }

  // 2. Project findUp
  const startPath = filePath ?? projectDir;
  const projectContent = await resolveProjectFindUp(
    startPath,
    projectDir,
  );
  if (projectContent !== null) {
    results.push(projectContent);
  }

  debugLogger.debug(
    `Resolved ${results.length} instruction file(s) for ${projectDir}`,
  );
  return results;
}

/**
 * Global resolution: first match wins.
 * Checks ~/.glm/AGENTS.md, then ~/.claude/CLAUDE.md.
 */
async function resolveGlobal(): Promise<string | null> {
  for (const candidate of GLOBAL_CANDIDATES) {
    const fullPath = path.join(candidate.dir(), candidate.file);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      if (content.trim()) {
        debugLogger.debug(`Global instructions from: ${fullPath}`);
        return content;
      }
    } catch {
      // File doesn't exist — continue to next candidate
    }
  }
  return null;
}

/**
 * Project findUp: walk from startPath upward to projectDir.
 * At each level, check .glm/AGENTS.md then .claude/CLAUDE.md.
 * First match wins.
 */
async function resolveProjectFindUp(
  startPath: string,
  projectDir: string,
): Promise<string | null> {
  const normalizedStart = path.resolve(startPath);
  const normalizedRoot = path.resolve(projectDir);

  // If startPath is a file, begin from its directory
  let currentDir: string;
  try {
    const stat = await fs.stat(normalizedStart);
    currentDir = stat.isDirectory()
      ? normalizedStart
      : path.dirname(normalizedStart);
  } catch {
    // Path doesn't exist — use directory portion
    currentDir = path.dirname(normalizedStart);
  }

  const rootDir = path.resolve(normalizedRoot);

  // Walk upward from currentDir to rootDir (inclusive)
  while (true) {
    for (const candidate of PROJECT_CANDIDATES) {
      const fullPath = path.join(currentDir, candidate);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        if (content.trim()) {
          debugLogger.debug(`Project instructions from: ${fullPath}`);
          return content;
        }
      } catch {
        // File doesn't exist — continue
      }
    }

    // Stop if we've reached the project root
    if (path.resolve(currentDir) === rootDir) {
      break;
    }

    // Move up one directory
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      // Reached filesystem root without finding project root
      break;
    }
    currentDir = parent;
  }

  return null;
}

/**
 * Synchronous version for hot-path contexts where async I/O is undesirable.
 * Uses fs.statSync / fs.readFileSync.
 */
export function resolveInstructionsSync(
  projectDir: string,
  filePath?: string,
): string[] {
  const results: string[] = [];

  // Global first-match
  for (const candidate of GLOBAL_CANDIDATES) {
    const fullPath = path.join(candidate.dir(), candidate.file);
    try {
      const content = require('node:fs').readFileSync(fullPath, 'utf-8');
      if (content.trim()) {
        results.push(content);
        break;
      }
    } catch {
      // Continue
    }
  }

  // Project findUp
  const startPath = filePath ?? projectDir;
  const normalizedStart = path.resolve(startPath);
  const normalizedRoot = path.resolve(projectDir);

  let currentDir = path.dirname(normalizedStart);
  try {
    const stat = require('node:fs').statSync(normalizedStart);
    if (stat.isDirectory()) currentDir = normalizedStart;
  } catch {
    // Use dirname
  }

  const rootDir = path.resolve(normalizedRoot);
  while (true) {
    for (const candidate of PROJECT_CANDIDATES) {
      const fullPath = path.join(currentDir, candidate);
      try {
        const content = require('node:fs').readFileSync(fullPath, 'utf-8');
        if (content.trim()) {
          results.push(content);
          return results;
        }
      } catch {
        // Continue
      }
    }

    if (path.resolve(currentDir) === rootDir) break;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return results;
}
