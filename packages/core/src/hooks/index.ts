/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Export types
export * from './types.js';

// Export core components
export { HookSystem } from './hookSystem.js';
export { HookRegistry } from './hookRegistry.js';
export { HookRunner } from './hookRunner.js';
export { HookAggregator } from './hookAggregator.js';
export { HookPlanner } from './hookPlanner.js';
export { HookEventHandler } from './hookEventHandler.js';
export { LoopGuard } from './loop-guard.js';

// Export new hook runners
export { HttpHookRunner } from './httpHookRunner.js';
export { FunctionHookRunner } from './functionHookRunner.js';

// Export session and async hook management
export { SessionHooksManager } from './sessionHooksManager.js';
export type { SessionHookEntry } from './sessionHooksManager.js';
export { AsyncHookRegistry, generateHookId } from './asyncHookRegistry.js';
export {
  registerSkillHooks,
  unregisterSkillHooks,
} from './registerSkillHooks.js';
export {
  interpolateEnvVars,
  interpolateHeaders,
  interpolateUrl,
  hasEnvVarReferences,
  extractEnvVarNames,
  buildGlmHookEnv,
} from './envInterpolator.js';
export { UrlValidator, createUrlValidator } from './urlValidator.js';

// Export interfaces and enums
export type { HookRegistryEntry } from './hookRegistry.js';
export { HooksConfigSource as ConfigSource } from './types.js';
export type { AggregatedHookResult } from './hookAggregator.js';
export type { HookEventContext } from './hookPlanner.js';
export { checkDelegationNeed, type DelegationHint } from './delegation-enforcer.js';
 export { detectWorkflowKeyword, getSupportedKeywords, getCategoryForKeyword, DELEGATION_CATEGORIES, type KeywordMatch, type DelegationCategory } from './keyword-detector.js';

// Export resilience hooks
export {
  preemptiveCompactionHook,
  todoPreserverHook,
  sessionRecoveryHook,
  continuationEnforcementHook,
  traceTimelineHook,
  verificationTierHook,
  type HookContext,
  type HookResult,
  type TodoItem,
} from './resilience/index.js';
