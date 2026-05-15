/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DeviceAuthorizationData } from '@glm-code/core';
import { useGLMAuth } from './useGLMAuth.js';
import {
  AuthType,
  glmOAuth2Events,
  GLMOAuth2Event,
} from '@glm-code/core';

// Mock the glmOAuth2Events
vi.mock('@glm-code/core', async () => {
  const actual = await vi.importActual('@glm-code/core');
  const mockEmitter = {
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnThis(),
  };
  return {
    ...actual,
    glmOAuth2Events: mockEmitter,
    GLMOAuth2Event: {
      AuthUri: 'authUri',
      AuthProgress: 'authProgress',
    },
  };
});

const mockGLMOAuth2Events = vi.mocked(glmOAuth2Events);

describe('useGLMAuth', () => {
  const mockDeviceAuth: DeviceAuthorizationData = {
    verification_uri: 'https://oauth.glm.com/device',
    verification_uri_complete: 'https://oauth.glm.com/device?user_code=ABC123',
    user_code: 'ABC123',
    expires_in: 1800,
    device_code: 'device_code_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state when not GLM auth', () => {
    const { result } = renderHook(() =>
      useGLMAuth(AuthType.USE_GEMINI, false),
    );

    expect(result.current.glmAuthState).toEqual({
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
    expect(result.current.cancelGLMAuth).toBeInstanceOf(Function);
  });

  it('should initialize with default state when GLM auth but not authenticating', () => {
    const { result } = renderHook(() =>
      useGLMAuth(AuthType.GLM_OAUTH, false),
    );

    expect(result.current.glmAuthState).toEqual({
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
    expect(result.current.cancelGLMAuth).toBeInstanceOf(Function);
  });

  it('should set up event listeners when GLM auth and authenticating', () => {
    renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    expect(mockGLMOAuth2Events.on).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockGLMOAuth2Events.on).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should handle device auth event', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.glmAuthState.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.glmAuthState.authStatus).toBe('polling');
  });

  it('should handle auth progress event - success', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    act(() => {
      handleAuthProgress!('success', 'Authentication successful!');
    });

    expect(result.current.glmAuthState.authStatus).toBe('success');
    expect(result.current.glmAuthState.authMessage).toBe(
      'Authentication successful!',
    );
  });

  it('should handle auth progress event - error', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    act(() => {
      handleAuthProgress!('error', 'Authentication failed');
    });

    expect(result.current.glmAuthState.authStatus).toBe('error');
    expect(result.current.glmAuthState.authMessage).toBe(
      'Authentication failed',
    );
  });

  it('should handle auth progress event - polling', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    act(() => {
      handleAuthProgress!('polling', 'Waiting for user authorization...');
    });

    expect(result.current.glmAuthState.authStatus).toBe('polling');
    expect(result.current.glmAuthState.authMessage).toBe(
      'Waiting for user authorization...',
    );
  });

  it('should handle auth progress event - rate_limit', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    act(() => {
      handleAuthProgress!(
        'rate_limit',
        'Too many requests. The server is rate limiting our requests. Please select a different authentication method or try again later.',
      );
    });

    expect(result.current.glmAuthState.authStatus).toBe('rate_limit');
    expect(result.current.glmAuthState.authMessage).toBe(
      'Too many requests. The server is rate limiting our requests. Please select a different authentication method or try again later.',
    );
  });

  it('should handle auth progress event without message', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    act(() => {
      handleAuthProgress!('success');
    });

    expect(result.current.glmAuthState.authStatus).toBe('success');
    expect(result.current.glmAuthState.authMessage).toBe(null);
  });

  it('should clean up event listeners when auth type changes', () => {
    const { rerender } = renderHook(
      ({ pendingAuthType, isAuthenticating }) =>
        useGLMAuth(pendingAuthType, isAuthenticating),
      {
        initialProps: {
          pendingAuthType: AuthType.GLM_OAUTH,
          isAuthenticating: true,
        },
      },
    );

    // Change to non-GLM auth
    rerender({ pendingAuthType: AuthType.USE_GEMINI, isAuthenticating: true });

    expect(mockGLMOAuth2Events.off).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockGLMOAuth2Events.off).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should clean up event listeners when authentication stops', () => {
    const { rerender } = renderHook(
      ({ isAuthenticating }) =>
        useGLMAuth(AuthType.GLM_OAUTH, isAuthenticating),
      { initialProps: { isAuthenticating: true } },
    );

    // Stop authentication
    rerender({ isAuthenticating: false });

    expect(mockGLMOAuth2Events.off).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockGLMOAuth2Events.off).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should clean up event listeners on unmount', () => {
    const { unmount } = renderHook(() =>
      useGLMAuth(AuthType.GLM_OAUTH, true),
    );

    unmount();

    expect(mockGLMOAuth2Events.off).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockGLMOAuth2Events.off).toHaveBeenCalledWith(
      GLMOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should reset state when switching from GLM auth to another auth type', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result, rerender } = renderHook(
      ({ pendingAuthType, isAuthenticating }) =>
        useGLMAuth(pendingAuthType, isAuthenticating),
      {
        initialProps: {
          pendingAuthType: AuthType.GLM_OAUTH,
          isAuthenticating: true,
        },
      },
    );

    // Simulate device auth
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.glmAuthState.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.glmAuthState.authStatus).toBe('polling');

    // Switch to different auth type
    rerender({ pendingAuthType: AuthType.USE_GEMINI, isAuthenticating: true });

    expect(result.current.glmAuthState.deviceAuth).toBe(null);
    expect(result.current.glmAuthState.authStatus).toBe('idle');
    expect(result.current.glmAuthState.authMessage).toBe(null);
  });

  it('should reset state when authentication stops', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result, rerender } = renderHook(
      ({ isAuthenticating }) =>
        useGLMAuth(AuthType.GLM_OAUTH, isAuthenticating),
      { initialProps: { isAuthenticating: true } },
    );

    // Simulate device auth
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.glmAuthState.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.glmAuthState.authStatus).toBe('polling');

    // Stop authentication
    rerender({ isAuthenticating: false });

    expect(result.current.glmAuthState.deviceAuth).toBe(null);
    expect(result.current.glmAuthState.authStatus).toBe('idle');
    expect(result.current.glmAuthState.authMessage).toBe(null);
  });

  it('should handle cancelGLMAuth function', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockGLMOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === GLMOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockGLMOAuth2Events;
    });

    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    // Set up some state
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.glmAuthState.deviceAuth).toEqual(mockDeviceAuth);

    // Cancel auth
    act(() => {
      result.current.cancelGLMAuth();
    });

    expect(result.current.glmAuthState.deviceAuth).toBe(null);
    expect(result.current.glmAuthState.authStatus).toBe('idle');
    expect(result.current.glmAuthState.authMessage).toBe(null);
  });

  it('should handle different auth types correctly', () => {
    // Test with GLM OAuth - should set up event listeners when authenticating
    const { result: glmResult } = renderHook(() =>
      useGLMAuth(AuthType.GLM_OAUTH, true),
    );
    expect(glmResult.current.glmAuthState.authStatus).toBe('idle');
    expect(mockGLMOAuth2Events.on).toHaveBeenCalled();

    // Test with other auth types - should not set up event listeners
    const { result: geminiResult } = renderHook(() =>
      useGLMAuth(AuthType.USE_GEMINI, true),
    );
    expect(geminiResult.current.glmAuthState.authStatus).toBe('idle');

    const { result: oauthResult } = renderHook(() =>
      useGLMAuth(AuthType.USE_OPENAI, true),
    );
    expect(oauthResult.current.glmAuthState.authStatus).toBe('idle');
  });

  it('should initialize with idle status when starting authentication with GLM auth', () => {
    const { result } = renderHook(() => useGLMAuth(AuthType.GLM_OAUTH, true));

    expect(result.current.glmAuthState.authStatus).toBe('idle');
    expect(mockGLMOAuth2Events.on).toHaveBeenCalled();
  });
});
