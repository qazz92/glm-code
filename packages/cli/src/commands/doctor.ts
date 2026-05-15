/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI command: glm doctor — run diagnostics on the environment.
 */

import type { CommandModule } from 'yargs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { writeStdoutLine } from '../utils/stdioHelpers.js';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export const doctorCommand: CommandModule = {
  command: 'doctor',
  describe: 'Run environment diagnostics',
  builder: (yargs) => yargs,
  handler: () => {
    const checks: CheckResult[] = [];

    // Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    checks.push({
      name: 'Node.js',
      status: major >= 22 ? 'ok' : 'error',
      message: `${nodeVersion} ${major >= 22 ? '✓' : '✗ (requires 22+)'}`,
    });

    // ~/.glm directory
    const homeDir = homedir();
    const glmDir = path.join(homeDir, '.glm');
    const glmExists = fs.existsSync(glmDir);
    checks.push({
      name: 'Config directory',
      status: glmExists ? 'ok' : 'warn',
      message: `${glmDir} ${glmExists ? '✓' : '✗ (will be created on first run)'}`,
    });

    // API key
    const apiKey =
      process.env['ZAI_API_KEY'] ||
      process.env['GLM_API_KEY'] ||
      process.env['OPENAI_API_KEY'];
    checks.push({
      name: 'API Key',
      status: apiKey ? 'ok' : 'error',
      message: apiKey
        ? `${apiKey.slice(0, 8)}... ✓`
        : '✗ (set ZAI_API_KEY, GLM_API_KEY, or OPENAI_API_KEY)',
    });

    // GLM MCP servers
    const settingsPath = path.join(glmDir, 'settings.json');
    let mcpStatus = 'No MCP servers configured';
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const mcpCount = Object.keys(settings.mcpServers || {}).length;
        mcpStatus = `${mcpCount} MCP server(s) configured ✓`;
      } catch {
        mcpStatus = 'Settings file invalid';
      }
    }
    checks.push({ name: 'MCP Servers', status: 'ok', message: mcpStatus });

    // Disk / platform info
    checks.push({
      name: 'Disk',
      status: 'ok',
      message: `Home: ${homeDir} | Platform: ${platform()} ${arch()}`,
    });

    // Print results
    writeStdoutLine('\n🔍 GLM Code Environment Diagnostics\n');
    for (const check of checks) {
      const icon =
        check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      writeStdoutLine(`  ${icon} ${check.name}: ${check.message}`);
    }

    const hasErrors = checks.some((c) => c.status === 'error');
    writeStdoutLine(
      hasErrors
        ? '\n❌ Some checks failed. Fix errors above before using GLM Code.'
        : '\n✅ All checks passed.',
    );
    if (hasErrors) process.exit(1);
  },
};
