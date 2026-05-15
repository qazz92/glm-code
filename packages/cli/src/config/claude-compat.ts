/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Discovers Claude Code slash commands from `~/.claude/commands/` and
 * `<project>/.claude/commands/`. Files are `.md` with optional YAML
 * frontmatter — same format as GLM commands.
 *
 * These commands are returned in the same SlashCommand format so the
 * CommandService can register them alongside native commands.
 */

import { promises as fs } from 'node:fs';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { glob } from 'glob';
import { createDebugLogger } from '@glm-code/core';
import type { ICommandLoader } from '../services/types.js';
import type { SlashCommand } from '../ui/commands/types.js';
import {
  parseMarkdownCommand,
  type MarkdownCommandDef,
} from '../services/markdown-command-parser.js';
import {
  createSlashCommandFromDefinition,
} from '../services/command-factory.js';

const debugLogger = createDebugLogger('CLAUDE_COMMANDS');

/**
 * Discovers and loads slash commands from `.claude/commands/` directories.
 * Scans both user-level (`~/.claude/commands/`) and project-level
 * (`<project>/.claude/commands/`) directories.
 */
export class ClaudeCommandLoader implements ICommandLoader {
  constructor(private readonly projectRoot: string) {}

  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const allCommands: SlashCommand[] = [];
    const globOptions = {
      nodir: true,
      dot: true,
      signal,
      follow: true,
    };

    const commandDirs = this.getCommandDirectories();

    for (const dirInfo of commandDirs) {
      try {
        if (!fsSync.existsSync(dirInfo.path)) {
          continue;
        }

        const mdFiles = await glob('**/*.md', {
          ...globOptions,
          cwd: dirInfo.path,
        });

        for (const file of mdFiles) {
          const fullPath = path.join(dirInfo.path, file);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const def: MarkdownCommandDef = parseMarkdownCommand(content);

            const command = createSlashCommandFromDefinition(
              fullPath,
              dirInfo.path,
              {
                prompt: def.prompt,
                description: def.frontmatter?.description,
              },
              undefined, // No extension name for compat commands
              '.md',
            );

            // Tag the source for identification
            command.source = 'skill-dir-command';
            command.sourceLabel = 'Claude Compat';
            command.sourceDetail = 'custom';

            allCommands.push(command);
          } catch (e) {
            debugLogger.warn(
              `Failed to load Claude command ${fullPath}: ${e}`,
            );
          }
        }
      } catch (e) {
        const isEnoent = (e as NodeJS.ErrnoException).code === 'ENOENT';
        const isAbortError =
          e instanceof Error && e.name === 'AbortError';
        if (!isEnoent && !isAbortError) {
          debugLogger.error(
            `Error loading Claude commands from ${dirInfo.path}:`,
            e,
          );
        }
      }
    }

    if (allCommands.length > 0) {
      debugLogger.debug(
        `Loaded ${allCommands.length} Claude compat command(s)`,
      );
    }

    return allCommands;
  }

  private getCommandDirectories(): Array<{ path: string }> {
    const homeDir = homedir();
    return [
      // User-level: ~/.claude/commands/
      { path: path.join(homeDir, '.claude', 'commands') },
      // Project-level: <project>/.claude/commands/
      { path: path.join(this.projectRoot, '.claude', 'commands') },
    ];
  }
}
