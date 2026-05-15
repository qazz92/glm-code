/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Action registry — 7 named actions with model, thinking, and temperature presets.
 * Actions provide a higher-level abstraction over raw model selection.
 */

/** Thinking effort level. */
export type ThinkingLevel =
  | 'inherit'
  | 'off'
  | 'min'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

/** Named action identifiers. */
export type GLMAction =
  | 'default'
  | 'smol'
  | 'slow'
  | 'plan'
  | 'designer'
  | 'commit'
  | 'task';

/** Configuration for a named action. */
export interface ActionConfig {
  /** Model to use. */
  model: string;
  /** Thinking effort level. */
  thinking: ThinkingLevel;
  /** Temperature for generation. */
  temperature: number;
  /** Human-readable description. */
  description: string;
}

/** The 7 predefined actions with their model/thinking/temperature presets. */
export const ACTION_MAP: Record<GLMAction, ActionConfig> = {
  default: {
    model: 'GLM-5.1',
    thinking: 'inherit',
    temperature: 0.7,
    description: 'Balanced coding',
  },
  smol: {
    model: 'GLM-4.5-Air',
    thinking: 'off',
    temperature: 0.3,
    description: 'Quick tasks',
  },
  slow: {
    model: 'GLM-5.1',
    thinking: 'high',
    temperature: 0.3,
    description: 'Deep reasoning',
  },
  plan: {
    model: 'GLM-5.1',
    thinking: 'high',
    temperature: 0.2,
    description: 'Planning & architecture',
  },
  designer: {
    model: 'GLM-5.1',
    thinking: 'medium',
    temperature: 0.9,
    description: 'Creative/visual',
  },
  commit: {
    model: 'GLM-4.5-Air',
    thinking: 'off',
    temperature: 0.0,
    description: 'Commit messages',
  },
  task: {
    model: 'GLM-5-Turbo',
    thinking: 'low',
    temperature: 0.5,
    description: 'Delegated tasks',
  },
};

/** All valid action names. */
export const ACTION_NAMES: readonly GLMAction[] = Object.keys(
  ACTION_MAP,
) as GLMAction[];

/** Current active action state. */
let activeAction: GLMAction = 'default';

/**
 * Get the currently active action.
 */
export function getActiveAction(): GLMAction {
  return activeAction;
}

/**
 * Set the active action.
 * @returns The config for the newly active action.
 */
export function setActiveAction(action: GLMAction): ActionConfig {
  if (!(action in ACTION_MAP)) {
    throw new Error(
      `Unknown action: ${action}. Valid: ${ACTION_NAMES.join(', ')}`,
    );
  }
  activeAction = action;
  return ACTION_MAP[action];
}

/**
 * Get the config for the active action.
 */
export function getActiveActionConfig(): ActionConfig {
  return ACTION_MAP[activeAction];
}

/**
 * Resolve model configuration for a given action.
 * Falls back to the active action if none specified.
 */
export function resolveModelForAction(action?: GLMAction): ActionConfig {
  return ACTION_MAP[action ?? activeAction];
}

/**
 * Check if a string is a valid action name.
 */
export function isValidAction(name: string): name is GLMAction {
  return name in ACTION_MAP;
}
