/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AuthType } from '@glm-code/core';
import {
  formatAcpModelId,
  parseAcpBaseModelId,
  parseAcpModelOption,
} from './acpModelUtils.js';

describe('acpModelUtils', () => {
  it('formats modelId(authType)', () => {
    expect(formatAcpModelId('glm3', AuthType.GLM_OAUTH)).toBe(
      `glm3(${AuthType.GLM_OAUTH})`,
    );
  });

  it('extracts base model id when string ends with parentheses', () => {
    expect(parseAcpBaseModelId(`glm3(${AuthType.USE_OPENAI})`)).toBe('glm3');
  });

  it('does not strip when parentheses are not a trailing suffix', () => {
    expect(parseAcpBaseModelId('glm3(x) y')).toBe('glm3(x) y');
  });

  it('parses modelId and validates authType', () => {
    expect(parseAcpModelOption(` glm3(${AuthType.USE_OPENAI}) `)).toEqual({
      modelId: 'glm3',
      authType: AuthType.USE_OPENAI,
    });
  });

  it('returns trimmed input as modelId when authType is invalid', () => {
    expect(parseAcpModelOption('glm3(not-a-real-auth)')).toEqual({
      modelId: 'glm3(not-a-real-auth)',
    });
  });
});
