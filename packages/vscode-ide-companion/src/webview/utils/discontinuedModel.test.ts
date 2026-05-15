/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DISCONTINUED_MESSAGES,
  isDiscontinuedModel,
  parseAcpModelId,
  GLM_OAUTH_AUTH_TYPE,
} from './discontinuedModel.js';

describe('parseAcpModelId', () => {
  it('extracts authType and base model id from a registry entry', () => {
    expect(parseAcpModelId('glm3-coder-plus(glm-oauth)')).toEqual({
      baseModelId: 'glm3-coder-plus',
      authType: 'glm-oauth',
      isRuntime: false,
    });
  });

  it('marks runtime snapshots and still strips the trailing wrapper', () => {
    expect(
      parseAcpModelId('$runtime|glm-oauth|glm3-coder-plus(glm-oauth)'),
    ).toEqual({
      baseModelId: '$runtime|glm-oauth|glm3-coder-plus',
      authType: 'glm-oauth',
      isRuntime: true,
    });
  });

  it('preserves inner parens and only strips the anchored trailing wrapper', () => {
    expect(parseAcpModelId('foo(bar)(openai)')).toEqual({
      baseModelId: 'foo(bar)',
      authType: 'openai',
      isRuntime: false,
    });
  });

  it('returns the raw id when no trailing wrapper is present', () => {
    expect(parseAcpModelId('plain-model-id')).toEqual({
      baseModelId: 'plain-model-id',
      isRuntime: false,
    });
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseAcpModelId('  gpt-4(openai)  ')).toEqual({
      baseModelId: 'gpt-4',
      authType: 'openai',
      isRuntime: false,
    });
  });
});

describe('isDiscontinuedModel', () => {
  it('flags a non-runtime GLM OAuth registry entry as discontinued', () => {
    expect(isDiscontinuedModel('glm3-coder-plus(glm-oauth)')).toBe(true);
  });

  it('does NOT flag a runtime GLM OAuth snapshot as discontinued', () => {
    expect(
      isDiscontinuedModel('$runtime|glm-oauth|glm3-coder-plus(glm-oauth)'),
    ).toBe(false);
  });

  it('does NOT flag other providers', () => {
    expect(isDiscontinuedModel('gpt-4(openai)')).toBe(false);
    expect(isDiscontinuedModel('claude-sonnet-4-6(anthropic)')).toBe(false);
    expect(isDiscontinuedModel('gemini-2.5-pro(gemini)')).toBe(false);
  });

  it('returns false for empty / non-string ids', () => {
    expect(isDiscontinuedModel('')).toBe(false);
    expect(isDiscontinuedModel(undefined as unknown as string)).toBe(false);
    expect(isDiscontinuedModel(null as unknown as string)).toBe(false);
  });

  it('returns false when the wrapper is absent (defensive)', () => {
    expect(isDiscontinuedModel('glm3-coder-plus')).toBe(false);
  });
});

describe('DISCONTINUED_MESSAGES', () => {
  it('exposes the three user-facing strings', () => {
    expect(DISCONTINUED_MESSAGES.badge).toBe('(Discontinued)');
    expect(DISCONTINUED_MESSAGES.description).toMatch(/Discontinued/);
    expect(DISCONTINUED_MESSAGES.blockedError).toContain('2026-04-15');
  });
});

describe('GLM_OAUTH_AUTH_TYPE', () => {
  it('matches the encoded value used by the ACP server', () => {
    expect(GLM_OAUTH_AUTH_TYPE).toBe('glm-oauth');
  });
});
