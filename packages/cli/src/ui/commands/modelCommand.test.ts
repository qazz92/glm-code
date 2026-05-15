/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  AuthType,
  type ContentGeneratorConfig,
  type Config,
} from '@glm-code/core';
import type { LoadedSettings } from '../../config/settings.js';

// Helper function to create a mock config
function createMockConfig(
  contentGeneratorConfig: ContentGeneratorConfig | null,
): Partial<Config> {
  return {
    getContentGeneratorConfig: vi.fn().mockReturnValue(contentGeneratorConfig),
  };
}

function createMockSettings(setValue = vi.fn()): Partial<LoadedSettings> {
  return {
    merged: {},
    user: { settings: {} },
    workspace: { settings: {} },
    isTrusted: false,
    setValue,
  } as unknown as Partial<LoadedSettings>;
}

describe('modelCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(modelCommand.name).toBe('model');
    expect(modelCommand.description).toBe(
      'Switch the model for this session (--fast for suggestion model, [model-id] to switch immediately).',
    );
  });

  it('should return error when config is not available', async () => {
    mockContext.services.config = null;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });

  it('should return error when content generator config is not available', async () => {
    const mockConfig = createMockConfig(null);
    mockContext.services.config = mockConfig as Config;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Content generator configuration not available.',
    });
  });

  it('should return error when auth type is not available', async () => {
    const mockConfig = createMockConfig({
      model: 'test-model',
      authType: undefined,
    });
    mockContext.services.config = mockConfig as Config;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Authentication type not available.',
    });
  });

  it('should return dialog action for GLM_OAUTH auth type', async () => {
    const mockConfig = createMockConfig({
      model: 'test-model',
      authType: AuthType.GLM_OAUTH,
    });
    mockContext.services.config = mockConfig as Config;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('should return dialog action for USE_OPENAI auth type', async () => {
    const mockConfig = createMockConfig({
      model: 'test-model',
      authType: AuthType.USE_OPENAI,
    });
    mockContext.services.config = mockConfig as Config;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('should return dialog action for unsupported auth types', async () => {
    const mockConfig = createMockConfig({
      model: 'test-model',
      authType: 'UNSUPPORTED_AUTH_TYPE' as AuthType,
    });
    mockContext.services.config = mockConfig as Config;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('should handle undefined auth type', async () => {
    const mockConfig = createMockConfig({
      model: 'test-model',
      authType: undefined,
    });
    mockContext.services.config = mockConfig as Config;

    const result = await modelCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Authentication type not available.',
    });
  });

  it('should switch the main model directly in interactive mode when args are provided', async () => {
    const setValue = vi.fn();
    const switchModel = vi.fn().mockResolvedValue(undefined);
    mockContext = createMockCommandContext({
      invocation: { raw: '/model glm-max', name: 'model', args: 'glm-max' },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.GLM_OAUTH,
          }),
          getAvailableModelsForAuthType: vi
            .fn()
            .mockReturnValue([{ id: 'glm-max', label: 'GLM Max' }]),
          switchModel,
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(mockContext, 'glm-max');

    expect(switchModel).toHaveBeenCalledWith(
      AuthType.GLM_OAUTH,
      'glm-max',
      undefined,
    );
    expect(setValue).toHaveBeenCalledWith(
      expect.any(String),
      'model.name',
      'glm-max',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Model: glm-max',
    });
  });

  it('should not persist the model when direct model validation fails', async () => {
    const setValue = vi.fn();
    const switchModel = vi.fn();
    mockContext = createMockCommandContext({
      invocation: {
        raw: '/model missing-model',
        name: 'model',
        args: 'missing-model',
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.GLM_OAUTH,
          }),
          switchModel,
          getAvailableModelsForAuthType: vi.fn().mockReturnValue([]),
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(mockContext, 'missing-model');

    expect(switchModel).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        "Model 'missing-model' is not available for auth type 'glm-oauth'.\n" +
        "No models are configured for auth type 'glm-oauth'.\n" +
        'Configure models in settings.modelProviders or run /model to select an available model.',
    });
  });

  it('should not persist the model when direct model switching fails after validation', async () => {
    const setValue = vi.fn();
    const switchError = new Error('Refresh failed');
    const switchModel = vi.fn().mockRejectedValue(switchError);
    mockContext = createMockCommandContext({
      invocation: {
        raw: '/model glm-max',
        name: 'model',
        args: 'glm-max',
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.GLM_OAUTH,
          }),
          switchModel,
          getAvailableModelsForAuthType: vi
            .fn()
            .mockReturnValue([{ id: 'glm-max', label: 'GLM Max' }]),
        },
        settings: createMockSettings(setValue),
      },
    });

    await expect(modelCommand.action!(mockContext, 'glm-max')).rejects.toThrow(
      'Refresh failed',
    );

    expect(switchModel).toHaveBeenCalledWith(
      AuthType.GLM_OAUTH,
      'glm-max',
      undefined,
    );
    expect(setValue).not.toHaveBeenCalled();
  });

  it('should explain how to configure models when direct switching fails', async () => {
    const setValue = vi.fn();
    const switchModel = vi.fn();
    mockContext = createMockCommandContext({
      invocation: {
        raw: '/model definitely-not-a-model',
        name: 'model',
        args: 'definitely-not-a-model',
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.USE_OPENAI,
          }),
          getAvailableModelsForAuthType: vi
            .fn()
            .mockReturnValue([{ id: 'gpt-4', label: 'GPT-4' }]),
          switchModel,
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(
      mockContext,
      'definitely-not-a-model',
    );

    expect(switchModel).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        "Model 'definitely-not-a-model' is not available for auth type 'openai'.\n" +
        "Available models for 'openai': gpt-4.\n" +
        'Configure models in settings.modelProviders or run /model to select an available model.',
    });
  });

  it('should explain when no models are configured for direct switching', async () => {
    const setValue = vi.fn();
    const switchModel = vi
      .fn()
      .mockRejectedValue(
        new Error("Model 'gpt-4o' not found for authType 'openai'"),
      );
    mockContext = createMockCommandContext({
      invocation: {
        raw: '/model gpt-4o',
        name: 'model',
        args: 'gpt-4o',
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.USE_OPENAI,
          }),
          getAvailableModelsForAuthType: vi.fn().mockReturnValue([]),
          switchModel,
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(mockContext, 'gpt-4o');

    expect(setValue).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        "Model 'gpt-4o' is not available for auth type 'openai'.\n" +
        "No models are configured for auth type 'openai'.\n" +
        'Configure models in settings.modelProviders or run /model to select an available model.',
    });
  });

  it('should switch provider-qualified models through switchModel', async () => {
    const setValue = vi.fn();
    const switchModel = vi.fn().mockResolvedValue(undefined);
    mockContext = createMockCommandContext({
      invocation: {
        raw: `/model gpt-4(${AuthType.USE_OPENAI})`,
        name: 'model',
        args: `gpt-4(${AuthType.USE_OPENAI})`,
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.GLM_OAUTH,
          }),
          getAuthType: vi.fn().mockReturnValue(AuthType.GLM_OAUTH),
          getAvailableModelsForAuthType: vi
            .fn()
            .mockReturnValue([{ id: 'gpt-4', label: 'GPT-4' }]),
          switchModel,
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(
      mockContext,
      `gpt-4(${AuthType.USE_OPENAI})`,
    );

    expect(switchModel).toHaveBeenCalledWith(
      AuthType.USE_OPENAI,
      'gpt-4',
      undefined,
    );
    expect(setValue).toHaveBeenCalledWith(
      expect.any(String),
      'security.auth.selectedType',
      AuthType.USE_OPENAI,
    );
    expect(setValue).toHaveBeenCalledWith(
      expect.any(String),
      'model.name',
      'gpt-4',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Model: gpt-4',
    });
  });

  it('should reject unavailable fast models for the current auth type', async () => {
    const setValue = vi.fn();
    const setFastModel = vi.fn();
    mockContext = createMockCommandContext({
      invocation: {
        raw: '/model --fast missing-model',
        name: 'model',
        args: '--fast missing-model',
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.USE_OPENAI,
          }),
          getAvailableModelsForAuthType: vi
            .fn()
            .mockReturnValue([{ id: 'glm-turbo', label: 'GLM Turbo' }]),
          setFastModel,
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(
      mockContext,
      '--fast missing-model',
    );

    expect(setValue).not.toHaveBeenCalled();
    expect(setFastModel).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        "Fast model 'missing-model' is not available for auth type 'openai'.\n" +
        "Available models for 'openai': glm-turbo.\n" +
        'Configure models in settings.modelProviders or run /model to select an available model.',
    });
  });

  it('should not treat model IDs prefixed with --fast as the --fast flag', async () => {
    const setValue = vi.fn();
    const switchModel = vi.fn().mockResolvedValue(undefined);
    mockContext = createMockCommandContext({
      invocation: {
        raw: '/model --fast-model',
        name: 'model',
        args: '--fast-model',
      },
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            model: 'glm-plus',
            authType: AuthType.USE_OPENAI,
          }),
          getAvailableModelsForAuthType: vi
            .fn()
            .mockReturnValue([{ id: '--fast-model', label: '--fast-model' }]),
          switchModel,
        },
        settings: createMockSettings(setValue),
      },
    });

    const result = await modelCommand.action!(mockContext, '--fast-model');

    expect(switchModel).toHaveBeenCalledWith(
      AuthType.USE_OPENAI,
      '--fast-model',
      undefined,
    );
    expect(setValue).toHaveBeenCalledWith(
      expect.any(String),
      'model.name',
      '--fast-model',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Model: --fast-model',
    });
  });

  describe('non-interactive mode', () => {
    it('should return current model without triggering dialog when no args', async () => {
      mockContext = createMockCommandContext({
        executionMode: 'non_interactive',
        services: {
          config: {
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              model: 'glm-max',
              authType: AuthType.GLM_OAUTH,
            }),
            getModel: vi.fn().mockReturnValue('glm-max'),
          },
        },
      });

      const result = await modelCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('glm-max'),
      });
      expect((result as { type: string }).type).toBe('message');
    });

    it('should return current fast model without triggering dialog for --fast no args', async () => {
      mockContext = createMockCommandContext({
        executionMode: 'non_interactive',
        invocation: { args: '--fast' },
        services: {
          config: {
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              model: 'glm-max',
              authType: AuthType.GLM_OAUTH,
            }),
            getModel: vi.fn().mockReturnValue('glm-max'),
          },
          settings: {
            merged: { fastModel: 'glm-turbo' } as Record<string, unknown>,
          },
        },
      });

      const result = await modelCommand.action!(mockContext, '--fast');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('glm-turbo'),
      });
    });
  });
});
