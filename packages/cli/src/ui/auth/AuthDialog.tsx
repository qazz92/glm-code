/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * GLM Code Auth Dialog — z.ai as the primary (and only first-class) provider.
 * Custom Provider remains available for advanced users.
 */

import type React from 'react';
import { useState, useMemo } from 'react';
import { AuthType } from '@glm-code/core';
import { Box, Text } from 'ink';
import Link from 'ink-link';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { DescriptiveRadioButtonSelect } from '../components/shared/DescriptiveRadioButtonSelect.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { t } from '../../i18n/index.js';
import {
  findProviderByCredentials,
  zaiProvider,
  customProvider,
} from '../../auth/allProviders.js';
import {
  resolveMetadataKey,
  type ProviderConfig,
} from '../../auth/providerConfig.js';
import { useProviderSetupFlow } from './useProviderSetupFlow.js';
import { ProviderSetupSteps } from './ProviderSetupSteps.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewLevel = 'main' | 'provider-setup';

type MainOption = 'ZAI' | 'CUSTOM_PROVIDER';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const MAIN_ITEMS = [
  {
    key: 'ZAI',
    title: t('GLM Code (z.ai)'),
    label: t('GLM Code (z.ai)'),
    description: t(
      'Use GLM models with your z.ai API key — Standard API Key or Coding Plan',
    ),
    value: 'ZAI' as MainOption,
  },
  {
    key: 'CUSTOM_PROVIDER',
    title: t('Custom Provider'),
    label: t('Custom Provider'),
    description: t(
      'Manually connect a local server, proxy, or unsupported provider',
    ),
    value: 'CUSTOM_PROVIDER' as MainOption,
  },
];

// ---------------------------------------------------------------------------
// Step label for provider-setup title bar
// ---------------------------------------------------------------------------

function getStepLabel(step: string | null, p: ProviderConfig): string {
  if (step === 'protocol') return t('Protocol');
  if (step === 'baseUrl') {
    if (p.uiLabels?.baseUrlStepTitle) return t(p.uiLabels.baseUrlStepTitle);
    return Array.isArray(p.baseUrl) ? t('Endpoint') : t('Base URL');
  }
  if (step === 'apiKey') return t('API Key');
  if (step === 'models') return t(p.uiLabels?.modelsStepTitle ?? 'Model IDs');
  if (step === 'advancedConfig') return t('Advanced Config');
  if (step === 'review') return t('Review');
  return '';
}

// ---------------------------------------------------------------------------
// View titles
// ---------------------------------------------------------------------------

const VIEW_TITLES: Record<string, string> = {
  main: t('GLM Code — Select Authentication Method'),
  'provider-setup': t('Provider Setup'),
};

// ---------------------------------------------------------------------------
// AuthDialog
// ---------------------------------------------------------------------------

export function AuthDialog(): React.JSX.Element {
  const {
    auth: { pendingAuthType, authError },
  } = useUIState();
  const {
    auth: { handleAuthSelect: onAuthSelect, handleProviderSubmit, onAuthError },
  } = useUIActions();
  const config = useConfig();
  const settings = useSettings();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewLevel, setViewLevel] = useState<ViewLevel>('main');
  const [_viewStack, setViewStack] = useState<ViewLevel[]>([]);

  const [mainIndex, setMainIndex] = useState<number | null>(null);

  const setupFlow = useProviderSetupFlow(handleProviderSubmit);

  // -- Navigation -----------------------------------------------------------

  const clearErrors = () => {
    setErrorMessage(null);
    onAuthError(null);
  };

  const pushView = (view: ViewLevel) => {
    setViewStack((prev) => [...prev, viewLevel]);
    setViewLevel(view);
  };

  const goBack = () => {
    clearErrors();

    if (viewLevel === 'provider-setup') {
      if (setupFlow.goBack()) return;
    }

    setViewStack((prev) => {
      const next = [...prev];
      const parent = next.pop() ?? 'main';
      setViewLevel(parent);
      return next;
    });
  };

  // -- Default main index from current auth state ---------------------------

  const contentGenConfig = config.getContentGeneratorConfig();
  const matchedProvider = findProviderByCredentials(
    contentGenConfig?.baseUrl,
    contentGenConfig?.apiKeyEnvKey,
  );
  const isCurrentlyZai = !!(
    matchedProvider && resolveMetadataKey(matchedProvider)
  );

  const defaultMainIndex = useMemo(() => {
    const currentAuth = pendingAuthType ?? config.getAuthType();
    if (!currentAuth) return 0;
    if (currentAuth === AuthType.USE_OPENAI && isCurrentlyZai) return 0;
    return 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthType, isCurrentlyZai]);

  // -- Handlers -------------------------------------------------------------

  const existingEnv = (settings.merged.env ?? {}) as Record<string, string>;

  const handleMainSelect = (value: MainOption) => {
    clearErrors();
    switch (value) {
      case 'ZAI':
        setupFlow.start(zaiProvider, undefined, existingEnv);
        pushView('provider-setup');
        break;
      case 'CUSTOM_PROVIDER':
        setupFlow.start(customProvider, undefined, existingEnv);
        pushView('provider-setup');
        break;
      default:
        break;
    }
  };

  // -- Keyboard handling ----------------------------------------------------

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (viewLevel !== 'main') {
          goBack();
          return;
        }
        if (errorMessage) return;
        if (config.getAuthType() === undefined) {
          setErrorMessage(
            t(
              'You must select an auth method to proceed. Press Ctrl+C again to exit.',
            ),
          );
          return;
        }
        onAuthSelect(undefined);
      }
    },
    { isActive: true },
  );

  // -- View title -----------------------------------------------------------

  const viewTitle = useMemo(() => {
    if (viewLevel !== 'provider-setup') {
      return VIEW_TITLES[viewLevel] ?? VIEW_TITLES['main'];
    }
    const p = setupFlow.state.provider;
    if (!p) return t('Provider Setup');
    const flowTitle = p.uiLabels?.flowTitle ?? p.label;
    const { stepIndex, totalSteps, step } = setupFlow.state;
    return t('{{flowTitle}} · Step {{step}}/{{total}} · {{stepLabel}}', {
      flowTitle,
      step: String(stepIndex),
      total: String(totalSteps),
      stepLabel: getStepLabel(step, p),
    });
  }, [viewLevel, setupFlow.state]);

  // -- Render ---------------------------------------------------------------

  return (
    <Box
      borderStyle="single"
      borderColor={theme?.border?.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>{viewTitle}</Text>

      {viewLevel === 'main' && (
        <Box marginTop={1}>
          <DescriptiveRadioButtonSelect
            items={MAIN_ITEMS}
            initialIndex={mainIndex != null ? mainIndex : defaultMainIndex}
            onSelect={handleMainSelect}
            onHighlight={(value) => {
              setMainIndex(
                MAIN_ITEMS.findIndex((item) => item.value === value),
              );
            }}
            itemGap={1}
          />
        </Box>
      )}

      {viewLevel === 'provider-setup' && (
        <ProviderSetupSteps flow={setupFlow} />
      )}

      {(authError || errorMessage) && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{authError || errorMessage}</Text>
        </Box>
      )}

      {viewLevel === 'main' && (
        <>
          <Box marginY={1}>
            <Text color={theme.border.default}>{'\u2500'.repeat(80)}</Text>
          </Box>
          <Box>
            <Text color={theme.text.primary}>
              {t('Terms of Services and Privacy Notice')}:
            </Text>
          </Box>
          <Box>
            <Link
              url="https://docs.z.ai/en/users/support/tos-privacy/"
              fallback={false}
            >
              <Text color={theme.text.secondary} underline>
                https://docs.z.ai/en/users/support/tos-privacy/
              </Text>
            </Link>
          </Box>
        </>
      )}
    </Box>
  );
}
