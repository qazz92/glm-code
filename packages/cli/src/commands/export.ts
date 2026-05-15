/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI command: glm export <session-id> [--format markdown|json]
 */

import type { Argv, CommandModule } from 'yargs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';

interface ExportArgs {
  sessionId: string;
  format: string;
  output?: string;
}

export const exportCommand: CommandModule<unknown, ExportArgs> = {
  command: 'export <sessionId>',
  describe: 'Export a session to markdown or JSON',
  builder: (yargs: Argv) =>
    yargs
      .positional('sessionId', {
        type: 'string',
        description: 'Session ID to export',
        demandOption: true,
      })
      .option('format', {
        alias: 'f',
        type: 'string',
        choices: ['markdown', 'json'],
        default: 'markdown',
        description: 'Output format: markdown or json',
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        description: 'Output file path',
      })
      .strict()
      .version(false),

  handler: (argv) => {
    const home = homedir();
    const sessionDir = path.join(home, '.glm', 'tmp');

    if (!fs.existsSync(sessionDir)) {
      console.error(`Session directory not found: ${sessionDir}`);
      process.exit(1);
    }

    // Find session file
    const candidates = fs
      .readdirSync(sessionDir)
      .filter((f) => f.includes(argv.sessionId))
      .sort();

    if (candidates.length === 0) {
      console.error(`Session not found: ${argv.sessionId}`);
      process.exit(1);
    }

    // Read session JSONL
    const sessionPath = path.join(
      sessionDir,
      candidates[0],
      'chats',
      'main.jsonl',
    );
    if (!fs.existsSync(sessionPath)) {
      console.error('Session chat file not found');
      process.exit(1);
    }

    const lines = fs.readFileSync(sessionPath, 'utf-8').trim().split('\n');
    const entries = lines.map((l) => JSON.parse(l));

    const outputDir = path.join(home, '.glm', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputPath =
      argv.output ||
      path.join(
        outputDir,
        `${argv.sessionId}.${argv.format === 'json' ? 'json' : 'md'}`,
      );

    if (argv.format === 'json') {
      fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));
    } else {
      const md = entries
        .map((e: Record<string, unknown>) => {
          const role = (e['role'] as string) || 'unknown';
          const content =
            typeof e['content'] === 'string'
              ? e['content']
              : JSON.stringify(e['content']);
          return `## ${role}\n\n${content}\n`;
        })
        .join('\n---\n\n');
      fs.writeFileSync(outputPath, md);
    }

    console.log(`Exported to ${outputPath}`);
  },
};
