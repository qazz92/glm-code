/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@glm-code/core';
import type { ProviderConfig } from '../../providerConfig.js';

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
  models: [
    { id: 'GLM-5.1', contextWindowSize: 204800, enableThinking: true },
    { id: 'GLM-5', contextWindowSize: 204800 },
    { id: 'GLM-5-Turbo', contextWindowSize: 204800 },
    { id: 'GLM-4.7', contextWindowSize: 131072 },
    { id: 'GLM-4.6', contextWindowSize: 131072 },
    { id: 'GLM-4.5-Air', contextWindowSize: 131072 },
    { id: 'GLM-4.5-AirX', contextWindowSize: 131072 },
    { id: 'GLM-4.5', contextWindowSize: 131072 },
  ],
  modelsEditable: true,
  modelNamePrefix: 'GLM',
  uiGroup: 'primary',
};
