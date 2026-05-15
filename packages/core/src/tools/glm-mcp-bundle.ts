/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * GLM MCP bundled server auto-registration.
 * On first run, ensures that GLM-bundled MCP servers are registered
 * in the user's settings.json under mcpServers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('GLM_MCP_BUNDLE');

/** Configuration for a bundled MCP server. */
interface BundledServerConfig {
  command: string;
  args: string[];
  description: string;
}

/** The 4 GLM-bundled MCP servers. */
const GLM_BUNDLED_MCP_SERVERS: Record<string, BundledServerConfig> = {
  'glm-vision': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-vision'],
    description: 'Image analysis and vision capabilities',
  },
  'glm-web-search': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-web-search'],
    description: 'Web search via z.ai',
  },
  'glm-web-reader': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-web-reader'],
    description: 'Web page content extraction',
  },
  'glm-zread': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-zread'],
    description: 'Document reading (PDF, DOCX, etc.)',
  },
};

/**
 * Ensure GLM-bundled MCP servers are registered in user settings.
 * Idempotent — only adds servers that are missing.
 * Users can disable individual servers by setting `disabled: true` in mcpServers config.
 *
 * @param settingsPath - Path to the user's settings.json file
 */
export function ensureBundledServers(settingsPath: string): void {
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      debugLogger.warn(`Failed to parse settings at ${settingsPath}`);
      return;
    }
  }

  // Get or create mcpServers object
  let mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};
  if (typeof mcpServers !== 'object' || mcpServers === null) {
    mcpServers = {};
  }

  let added = 0;
  for (const [name, config] of Object.entries(GLM_BUNDLED_MCP_SERVERS)) {
    if (!(name in mcpServers)) {
      (mcpServers as Record<string, unknown>)[name] = {
        command: config.command,
        args: config.args,
        description: config.description,
      };
      added++;
      debugLogger.info(`Registered bundled MCP server: ${name}`);
    }
  }

  if (added > 0) {
    settings['mcpServers'] = mcpServers;
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      debugLogger.info(`Registered ${added} GLM bundled MCP servers`);
    } catch (err) {
      debugLogger.warn(`Failed to write settings: ${err}`);
    }
  } else {
    debugLogger.debug('All GLM bundled MCP servers already registered');
  }
}

/**
 * Get the list of bundled server names.
 */
export function getBundledServerNames(): string[] {
  return Object.keys(GLM_BUNDLED_MCP_SERVERS);
}
