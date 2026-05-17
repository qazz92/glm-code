/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthType } from '@glm-code/core';
import { zaiProvider, buildInstallPlan } from '../../allProviders.js';
import { fetchZaiModels } from './zai.js';

describe('zaiProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers standard API key and Coding Plan endpoints', () => {
    expect(zaiProvider).toMatchObject({
      id: 'zai',
      label: 'GLM Code (z.ai)',
      protocol: AuthType.USE_OPENAI,
      envKey: 'ZAI_API_KEY',
    });

    expect(Array.isArray(zaiProvider.baseUrl)).toBe(true);
    const urls = (zaiProvider.baseUrl as Array<{ url: string }>).map(
      (o) => o.url,
    );
    expect(urls).toContain('https://api.z.ai/api/paas/v4');
    expect(urls).toContain('https://api.z.ai/api/coding/paas/v4');
  });

  it('creates an install plan with per-model metadata for known IDs', () => {
    const plan = buildInstallPlan(zaiProvider, {
      baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      apiKey: 'sk-zai',
      modelIds: ['glm-5.1', 'glm-5'],
    });

    const models = plan.modelProviders?.[0]?.models;
    expect(models).toHaveLength(2);
    expect(models?.[0]).toMatchObject({
      id: 'glm-5.1',
      name: '[GLM] glm-5.1',
      generationConfig: {
        contextWindowSize: 204800,
        extra_body: { enable_thinking: true },
      },
    });
    expect(models?.[1]).toMatchObject({
      id: 'glm-5',
      generationConfig: { contextWindowSize: 204800 },
    });
  });

  it('matches known model metadata case-insensitively', () => {
    const plan = buildInstallPlan(zaiProvider, {
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKey: 'sk-zai',
      modelIds: ['GLM-5.1'],
    });

    expect(plan.modelProviders?.[0]?.models[0]).toMatchObject({
      id: 'GLM-5.1',
      name: '[GLM] GLM-5.1',
      generationConfig: {
        contextWindowSize: 204800,
        extra_body: { enable_thinking: true },
      },
    });
  });

  it('falls back gracefully for unknown model IDs', () => {
    const plan = buildInstallPlan(zaiProvider, {
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKey: 'sk-zai',
      modelIds: ['glm-new-model'],
    });

    const models = plan.modelProviders?.[0]?.models;
    expect(models?.[0]).toMatchObject({
      id: 'glm-new-model',
      name: '[GLM] glm-new-model',
    });
    expect(models?.[0]?.generationConfig).toBeUndefined();
  });

  it('fetches selectable GLM models from the z.ai models endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'text-embedding-3-small' },
          { id: 'glm-4.6', context_length: 131072 },
          { id: 'glm-5.1' },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchZaiModels({
      apiKey: 'sk-zai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.z.ai/api/paas/v4/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer sk-zai',
        }),
      }),
    );
    expect(models.map((model) => model.id)).toEqual(['glm-5.1', 'glm-4.6']);
    expect(models[0]).toMatchObject({
      id: 'glm-5.1',
      contextWindowSize: 204800,
      enableThinking: true,
    });
  });

  it('surfaces z.ai model discovery errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: { message: 'Authentication parameter not received' },
        }),
      })),
    );

    await expect(
      fetchZaiModels({
        apiKey: 'bad-key',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      }),
    ).rejects.toThrow(
      'z.ai models request failed (401): Authentication parameter not received',
    );
  });
});
