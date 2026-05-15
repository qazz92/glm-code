/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * REMOVED — provider has been retired in favor of z.ai + custom.
 */

export const OPENROUTER_ENV_KEY = 'OPENROUTER_API_KEY';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const openRouterProvider = null as any;

export async function createOpenRouterProviderInstallPlan(_opts: any): Promise<any> {
  throw new Error('OpenRouter provider has been removed');
}
