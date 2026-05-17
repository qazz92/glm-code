/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@glm-code/core';
import type { ModelSpec, ProviderConfig } from '../../providerConfig.js';

interface ZaiModelApiRecord {
  id?: unknown;
  context_length?: unknown;
  contextWindowSize?: unknown;
}

interface ZaiModelsApiResponse {
  data?: unknown;
}

const ZAI_DEFAULT_MODELS: ModelSpec[] = [
  { id: 'glm-5.1', contextWindowSize: 204800, enableThinking: true },
  { id: 'glm-5', contextWindowSize: 204800 },
  { id: 'glm-5-turbo', contextWindowSize: 204800 },
  { id: 'glm-4.7', contextWindowSize: 131072 },
  { id: 'glm-4.6', contextWindowSize: 131072 },
  { id: 'glm-4.5-air', contextWindowSize: 131072 },
  { id: 'glm-4.5-airx', contextWindowSize: 131072 },
  { id: 'glm-4.5', contextWindowSize: 131072 },
];

const KNOWN_ZAI_MODEL_METADATA = new Map(
  ZAI_DEFAULT_MODELS.map((model) => [model.id.toLowerCase(), model]),
);

const ZAI_RECOMMENDED_ORDER = ZAI_DEFAULT_MODELS.map((model) => model.id);

function buildModelsUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('models', normalizedBase).toString();
}

function getErrorMessageFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const error = record['error'];
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>)['message'];
    return typeof message === 'string' ? message : undefined;
  }
  const message = record['message'];
  return typeof message === 'string' ? message : undefined;
}

function isChatModelId(id: string): boolean {
  const normalized = id.toLowerCase();
  if (!normalized.startsWith('glm-')) {
    return false;
  }
  return ![
    'embedding',
    'rerank',
    'image',
    'video',
    'audio',
    'tts',
    'whisper',
  ].some((blocked) => normalized.includes(blocked));
}

function toZaiModelSpec(record: unknown): ModelSpec | null {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const model = record as ZaiModelApiRecord;
  if (typeof model.id !== 'string' || !isChatModelId(model.id)) {
    return null;
  }

  const known = KNOWN_ZAI_MODEL_METADATA.get(model.id.toLowerCase());
  const contextValue =
    typeof model.context_length === 'number'
      ? model.context_length
      : typeof model.contextWindowSize === 'number'
        ? model.contextWindowSize
        : known?.contextWindowSize;

  return {
    id: model.id,
    ...(contextValue ? { contextWindowSize: contextValue } : {}),
    ...(known?.enableThinking ? { enableThinking: true } : {}),
    ...(known?.modalities ? { modalities: known.modalities } : {}),
    ...(known?.description ? { description: known.description } : {}),
  };
}

function compareZaiModels(a: ModelSpec, b: ModelSpec): number {
  const aIndex = ZAI_RECOMMENDED_ORDER.indexOf(a.id.toLowerCase());
  const bIndex = ZAI_RECOMMENDED_ORDER.indexOf(b.id.toLowerCase());
  const normalizedAIndex =
    aIndex === -1 ? ZAI_RECOMMENDED_ORDER.length : aIndex;
  const normalizedBIndex =
    bIndex === -1 ? ZAI_RECOMMENDED_ORDER.length : bIndex;
  if (normalizedAIndex !== normalizedBIndex) {
    return normalizedAIndex - normalizedBIndex;
  }
  return a.id.localeCompare(b.id);
}

export async function fetchZaiModels(params: {
  apiKey: string;
  baseUrl: string;
}): Promise<ModelSpec[]> {
  const response = await fetch(buildModelsUrl(params.baseUrl), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
  });

  const payload = (await response.json().catch(() => undefined)) as
    | ZaiModelsApiResponse
    | undefined;

  if (!response.ok) {
    const detail = getErrorMessageFromPayload(payload);
    throw new Error(
      detail
        ? `z.ai models request failed (${response.status}): ${detail}`
        : `z.ai models request failed (${response.status} ${response.statusText})`,
    );
  }

  const records = Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set<string>();
  const models = records
    .map((record) => toZaiModelSpec(record))
    .filter((model): model is ModelSpec => {
      if (!model) return false;
      const key = model.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareZaiModels);

  if (models.length === 0) {
    throw new Error('z.ai models request returned no usable GLM chat models.');
  }

  return models;
}

export const zaiProvider: ProviderConfig = {
  id: 'zai',
  label: 'GLM Code (z.ai)',
  description: 'GLM models via z.ai API',
  protocol: AuthType.USE_OPENAI,
  baseUrl: [
    {
      id: 'standard-api-key',
      label: 'Standard API Key',
      url: 'https://api.z.ai/api/paas/v4',
      documentationUrl: 'https://docs.z.ai/',
    },
    {
      id: 'coding-plan',
      label: 'Coding Plan',
      url: 'https://api.z.ai/api/coding/paas/v4',
      documentationUrl: 'https://docs.z.ai/',
    },
  ],
  envKey: 'ZAI_API_KEY',
  authMethod: 'input',
  models: ZAI_DEFAULT_MODELS,
  discoverModels: fetchZaiModels,
  modelsEditable: true,
  modelNamePrefix: 'GLM',
  uiGroup: 'primary',
  uiLabels: {
    modelsStepTitle: 'Models',
  },
};
