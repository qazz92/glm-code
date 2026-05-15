/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import {
  AuthType,
  glmOAuth2Events,
  GLMOAuth2Event,
  type DeviceAuthorizationData,
} from '@glm-code/core';

export interface GLMAuthState {
  deviceAuth: DeviceAuthorizationData | null;
  authStatus:
    | 'idle'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'rate_limit';
  authMessage: string | null;
}

export interface ExternalAuthState {
  title: string;
  message: string;
  detail?: string;
}

export const useGLMAuth = (
  pendingAuthType: AuthType | undefined,
  isAuthenticating: boolean,
) => {
  const [glmAuthState, setGLMAuthState] = useState<GLMAuthState>({
    deviceAuth: null,
    authStatus: 'idle',
    authMessage: null,
  });

  const isGLMAuth = pendingAuthType === AuthType.GLM_OAUTH;

  // Set up event listeners when authentication starts
  useEffect(() => {
    if (!isGLMAuth || !isAuthenticating) {
      // Reset state when not authenticating or not GLM auth
      setGLMAuthState({
        deviceAuth: null,
        authStatus: 'idle',
        authMessage: null,
      });
      return;
    }

    setGLMAuthState((prev) => ({
      ...prev,
      authStatus: 'idle',
    }));

    // Set up event listeners
    const handleDeviceAuth = (deviceAuth: DeviceAuthorizationData) => {
      setGLMAuthState((prev) => ({
        ...prev,
        deviceAuth: {
          verification_uri: deviceAuth.verification_uri,
          verification_uri_complete: deviceAuth.verification_uri_complete,
          user_code: deviceAuth.user_code,
          expires_in: deviceAuth.expires_in,
          device_code: deviceAuth.device_code,
        },
        authStatus: 'polling',
      }));
    };

    const handleAuthProgress = (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => {
      setGLMAuthState((prev) => ({
        ...prev,
        authStatus: status,
        authMessage: message || null,
      }));
    };

    // Add event listeners
    glmOAuth2Events.on(GLMOAuth2Event.AuthUri, handleDeviceAuth);
    glmOAuth2Events.on(GLMOAuth2Event.AuthProgress, handleAuthProgress);

    // Cleanup event listeners when component unmounts or auth finishes
    return () => {
      glmOAuth2Events.off(GLMOAuth2Event.AuthUri, handleDeviceAuth);
      glmOAuth2Events.off(GLMOAuth2Event.AuthProgress, handleAuthProgress);
    };
  }, [isGLMAuth, isAuthenticating]);

  const cancelGLMAuth = useCallback(() => {
    // Emit cancel event to stop polling
    glmOAuth2Events.emit(GLMOAuth2Event.AuthCancel);

    setGLMAuthState({
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
  }, []);

  return {
    glmAuthState,
    cancelGLMAuth,
  };
};
