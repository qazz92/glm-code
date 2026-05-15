/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */


import type { ModelConfig } from './types.js';

type AuthType = import('../core/contentGenerator.js').AuthType;
type ContentGeneratorConfig =
  import('../core/contentGenerator.js').ContentGeneratorConfig;

/**
 * Field keys for model-scoped generation config.
 *
 * Kept in a small standalone module to avoid circular deps. The `import('...')`
 * usage is type-only and does not emit runtime imports.
 */
export const MODEL_GENERATION_CONFIG_FIELDS = [
  'samplingParams',
  'timeout',
  'maxRetries',
  'retryErrorCodes',
  'enableCacheControl',
  'schemaCompliance',
  'reasoning',
  'contextWindowSize',
  'customHeaders',
  'extra_body',
  'modalities',
  'splitToolMedia',
] as const satisfies ReadonlyArray<keyof ContentGeneratorConfig>;

/**
 * Credential-related fields that are part of ContentGeneratorConfig
 * but not ModelGenerationConfig.
 */
export const CREDENTIAL_FIELDS = [
  'model',
  'apiKey',
  'apiKeyEnvKey',
  'baseUrl',
] as const satisfies ReadonlyArray<keyof ContentGeneratorConfig>;

/**
 * All provider-sourced fields that need to be tracked for source attribution
 * and cleared when switching from provider to manual credentials.
 */
export const PROVIDER_SOURCED_FIELDS = [
  ...CREDENTIAL_FIELDS,
  ...MODEL_GENERATION_CONFIG_FIELDS,
] as const;

/**
 * Environment variable mappings per authType.
 */
export interface AuthEnvMapping {
  apiKey: string[];
  baseUrl: string[];
  model: string[];
}

export const AUTH_ENV_MAPPINGS = {
  openai: {
    apiKey: ['ZAI_API_KEY', 'GLM_API_KEY', 'OPENAI_API_KEY'],
    baseUrl: ['OPENAI_BASE_URL'],
    model: ['GLM_MODEL', 'GLM_MODEL'],
  },
  anthropic: {
    apiKey: ['ANTHROPIC_API_KEY'],
    baseUrl: ['ANTHROPIC_BASE_URL'],
    model: ['ANTHROPIC_MODEL'],
  },
  gemini: {
    apiKey: ['GEMINI_API_KEY'],
    baseUrl: [],
    model: ['GEMINI_MODEL'],
  },
  'vertex-ai': {
    apiKey: ['GOOGLE_API_KEY'],
    baseUrl: [],
    model: ['GOOGLE_MODEL'],
  },
  'glm-oauth': {
    apiKey: [],
    baseUrl: [],
    model: [],
  },
} as const satisfies Record<AuthType, AuthEnvMapping>;

export const DEFAULT_MODELS = {
  openai: 'GLM-4.5-Air',
} as Partial<Record<AuthType, string>>;

/**
 * GLM OAuth models — emptied since GLM Code does not use glm-oauth.
 * Kept as empty array to avoid breaking imports across the codebase.
 */
export const GLM_OAUTH_MODELS: ModelConfig[] = [];

/**
 * Derive allowed models from GLM_OAUTH_MODELS for authorization.
 */
export const GLM_OAUTH_ALLOWED_MODELS = GLM_OAUTH_MODELS.map(
  (model) => model.id,
) as readonly string[];

/**
 * Display label for auth types shown in the model dialog.
 */
export const AUTH_TYPE_LABELS: Partial<Record<AuthType, string>> = {
  openai: 'z.ai',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  'vertex-ai': 'Vertex AI',
  'glm-oauth': 'z.ai',
};
