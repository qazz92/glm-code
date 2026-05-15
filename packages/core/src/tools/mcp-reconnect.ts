/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * MCP Auto-Reconnect — handles MCP server disconnections with
 * exponential backoff and manual reload support.
 */

import { createDebugLogger } from '../utils/debugLogger.js';
 import {
   type Config,
   type MCPServerConfig,
 } from '../config/config.js';
 import type { ToolRegistry } from './tool-registry.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { WorkspaceContext } from '../utils/workspaceContext.js';
import {
  connectAndDiscover,
  updateMCPServerStatus,
  MCPServerStatus,
} from './mcp-client.js';

const debugLogger = createDebugLogger('MCP_RECONNECT');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 16000;

interface ReconnectState {
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
  disabled: boolean;
}

export class MCPReconnector {
  private states = new Map<string, ReconnectState>();
   private config: {
     mcpServers: Record<string, MCPServerConfig>;
     mcpServerCommand: string | undefined;
     toolRegistry: ToolRegistry;
     promptRegistry: PromptRegistry;
     debugMode: boolean;
     workspaceContext: WorkspaceContext;
     cliConfig: Config;
   } | null = null;

  /**
   * Initialize the reconnector with the MCP client manager configuration.
   */
   initialize(config: {
     mcpServers: Record<string, MCPServerConfig>;
     mcpServerCommand: string | undefined;
     toolRegistry: ToolRegistry;
     promptRegistry: PromptRegistry;
     debugMode: boolean;
     workspaceContext: WorkspaceContext;
     cliConfig: Config;
   }): void {
     this.config = config;
  }

  /**
   * Called when an MCP server disconnects unexpectedly.
   * Starts the reconnection process with exponential backoff.
   */
  onDisconnect(serverName: string): void {
    const state = this.states.get(serverName);
    if (state?.disabled) {
      debugLogger.debug('skipping reconnect for disabled server', {
        serverName,
      });
      return;
    }

    if (state?.timer) {
      debugLogger.debug('reconnect already in progress', { serverName });
      return;
    }

    debugLogger.info('server disconnected, starting reconnect', {
      serverName,
    });
    this.reconnect(serverName, 1);
  }

  /**
   * Attempt to reconnect an MCP server.
   */
  async reconnect(serverName: string, attempt: number): Promise<void> {
    if (!this.config) {
      debugLogger.warn('no config, cannot reconnect', { serverName });
      return;
    }

    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      debugLogger.warn('no config for server', { serverName });
      return;
    }

    debugLogger.info('reconnect attempt', { serverName, attempt });

    try {
      updateMCPServerStatus(serverName, MCPServerStatus.CONNECTING);
      await connectAndDiscover(
        serverName,
        serverConfig,
        this.config.toolRegistry,
        this.config.promptRegistry,
        this.config.debugMode,
        this.config.workspaceContext,
        this.config.cliConfig,
      );
      debugLogger.info('reconnect succeeded', { serverName, attempt });
      this.states.delete(serverName);
      updateMCPServerStatus(serverName, MCPServerStatus.CONNECTED);
    } catch (err) {
      debugLogger.warn('reconnect failed', {
        serverName,
        attempt,
        error: String(err),
      });

      if (attempt >= MAX_RETRIES) {
        this.onMaxRetries(serverName);
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, ... (capped at MAX_DELAY_MS)
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      debugLogger.info('scheduling next attempt', {
        serverName,
        nextAttempt: attempt + 1,
        delayMs: delay,
      });

      const state: ReconnectState = {
        attempt: attempt + 1,
        timer: setTimeout(() => {
          const s = this.states.get(serverName);
          if (s) {
            s.timer = null;
          }
          this.reconnect(serverName, attempt + 1);
        }, delay),
        disabled: false,
      };
      this.states.set(serverName, state);
    }
  }

  /**
   * Called when max retries are exhausted.
   * Disables the server and sends a notification to the user.
   */
  onMaxRetries(serverName: string): void {
    debugLogger.warn('max retries reached, disabling server', { serverName });

    const state: ReconnectState = {
      attempt: MAX_RETRIES,
      timer: null,
      disabled: true,
    };
    this.states.set(serverName, state);

    updateMCPServerStatus(serverName, MCPServerStatus.DISCONNECTED);

    // Notify user via stderr
    process.stderr.write(
      `[glm-code] MCP server "${serverName}" is unavailable after ${MAX_RETRIES} reconnection attempts. ` +
        `Use /mcp-reload ${serverName} to manually retry.\n`,
    );
  }

  /**
   * Force immediate reconnection attempt for a server,
   * resetting any backoff state.
   */
  async manualReload(serverName: string): Promise<boolean> {
    const state = this.states.get(serverName);
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    this.states.delete(serverName);

    debugLogger.info('manual reload requested', { serverName });

    try {
      await this.reconnect(serverName, 1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a server is currently in a reconnection cycle.
   */
  isReconnecting(serverName: string): boolean {
    const state = this.states.get(serverName);
    return state !== undefined && !state.disabled;
  }

  /**
   * Check if a server has been disabled after max retries.
   */
  isDisabled(serverName: string): boolean {
    const state = this.states.get(serverName);
    return state?.disabled === true;
  }

  /**
   * Cancel all pending reconnection attempts.
   */
  cancelAll(): void {
    for (const [serverName, state] of this.states) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      debugLogger.debug('cancelled reconnect', { serverName });
    }
    this.states.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: MCPReconnector | null = null;

export function getMCPReconnector(): MCPReconnector {
  if (!_instance) {
    _instance = new MCPReconnector();
  }
  return _instance;
}

/** Reset singleton (tests only). */
export function _resetMCPReconnector(): void {
  if (_instance) {
    _instance.cancelAll();
  }
  _instance = null;
}
