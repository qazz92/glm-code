/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI command: glm gc — garbage collect old sessions and temp files.
 */

import type { CommandModule } from 'yargs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { writeStdoutLine } from '../utils/stdioHelpers.js';

interface GcArgs {
  days: string;
  'dry-run': boolean;
}

function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      const full = path.join(dirPath, entry);
      const stat = fs.statSync(full);
      size += stat.isDirectory() ? getDirSize(full) : stat.size;
    }
  } catch {
    /* ignore */
  }
  return size;
}

export const gcCommand: CommandModule<unknown, GcArgs> = {
  command: 'gc',
  describe: 'Garbage collect old sessions, checkpoints, and temp files',
  builder: (yargs) =>
    yargs
      .option('days', {
        type: 'string',
        default: '30',
        describe: 'Remove files older than N days',
      })
      .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Show what would be deleted without deleting',
      }),
  handler: (argv) => {
    const homeDir = homedir();
    const glmDir = path.join(homeDir, '.glm');
    const maxAge = parseInt(argv.days, 10) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAge;

    let removed = 0;
    let bytesFreed = 0;

    // Clean sessions
    const sessionsDir = path.join(glmDir, 'tmp');
    if (fs.existsSync(sessionsDir)) {
      for (const entry of fs.readdirSync(sessionsDir)) {
        const fullPath = path.join(sessionsDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          const size = getDirSize(fullPath);
          if (!argv['dry-run']) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
          removed++;
          bytesFreed += size;
        }
      }
    }

    // Clean checkpoints
    const checkpointsDir = path.join(glmDir, 'checkpoints');
    if (fs.existsSync(checkpointsDir)) {
      for (const entry of fs.readdirSync(checkpointsDir)) {
        const fullPath = path.join(checkpointsDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          bytesFreed += stat.size;
          if (!argv['dry-run']) fs.unlinkSync(fullPath);
          removed++;
        }
      }
    }

    writeStdoutLine(
      `${argv['dry-run'] ? '[DRY RUN] ' : ''}Removed ${removed} items, freed ${(bytesFreed / 1024 / 1024).toFixed(1)}MB`,
    );
  },
};
