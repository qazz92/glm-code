/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hook Plugin SDK — public API for writing user hooks.
 * Users create `.glm/hooks/my-hook.ts` files using `defineHook()`.
 */

import type { HookEventName } from './types.js';

/** API surface available to hook handlers. */
export interface HookContext {
  /** Run a shell command and return stdout. */
  shell: (command: string) => Promise<string>;
  /** Log a debug message. */
  log: (msg: string) => void;
  /** Read/write persistent state (JSON serializable). */
  state: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  /** Access session metadata. */
  session: {
    getId: () => string;
    getWorkingDir: () => string;
    getModel: () => string;
  };
  /** Update the HUD display text. */
  hud: (text: string) => void;
  /** Send a notification to configured channels. */
  notify: (msg: string) => void;
  /** Run a GLM prompt and get the response. */
  glm: (prompt: string) => Promise<string>;
  /** The abort signal for the current operation. */
  signal?: globalThis.AbortSignal;
}

/** Result returned by a hook handler. */
export interface HookResult {
  /** Whether to continue execution. Default: true. */
  continue?: boolean;
  /** Optional message to display. */
  message?: string;
  /** Optional reason for stopping. */
  reason?: string;
  /** Optional system message injected into the conversation. */
  systemMessage?: string;
}

/** A hook definition created via `defineHook()`. */
export interface HookDefinition {
  /** Unique name for this hook. */
  name: string;
  /** The event this hook listens to. */
  event: HookEventName;
  /** The hook handler function. */
  handler: (ctx: HookContext, payload: unknown) => Promise<HookResult | void>;
}

/**
 * Define a hook. This is the main entry point for the Hook Plugin SDK.
 *
 * Usage:
 * ```typescript
 * import { defineHook } from '@glm-code/core';
 *
 * export default defineHook({
 *   name: 'my-hook',
 *   event: 'UserPromptSubmit',
 *   handler: async (ctx, payload) => {
 *     ctx.log('Hook fired!');
 *     return { continue: true };
 *   },
 * });
 * ```
 */
export function defineHook(definition: HookDefinition): HookDefinition {
  return definition;
}
