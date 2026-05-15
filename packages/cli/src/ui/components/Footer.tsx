/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { execSync } from 'child_process';
import { theme } from '../semantic-colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { AutoAcceptIndicator } from './AutoAcceptIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { BackgroundTasksPill } from './background-view/BackgroundTasksPill.js';
import { MCPHealthPill } from './mcp/MCPHealthPill.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

import { useStatusLine } from '../hooks/useStatusLine.js';
import { useConfigInitMessage } from '../hooks/useConfigInitMessage.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { ApprovalMode } from '@glm-code/core';
import { GeminiSpinner } from './GeminiRespondingSpinner.js';
import { t } from '../../i18n/index.js';

// ── HUD helpers (from GLMDashboard) ──────────────────────────────────────

/** Truncate middle of a path string if it exceeds maxLen. */
function truncateMiddle(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  const head = Math.ceil((maxLen - 3) / 2);
  const tail = Math.floor((maxLen - 3) / 2);
  return path.slice(0, head) + '...' + path.slice(-tail);
}

/** Format token count as human-readable K value (e.g. "200K"). */
function fmtK(tokens: number): string {
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  const v = tokens / 1_000;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
}

/** Run git commands synchronously and return branch + status counts. Returns null if not a git repo. */
function getGitInfo(cwd: string): { branch: string; staged: number; untracked: number } | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    let staged = 0;
    let untracked = 0;
    if (status) {
      for (const line of status.split('\n')) {
        const x = line[0];
        const y = line[1];
        if (x === 'M' || x === 'A' || x === 'D' || x === 'R' || x === 'C') {
          staged++;
        }
        if (x === '?' && y === '?') {
          untracked++;
        }
      }
    }

    return { branch, staged, untracked };
  } catch {
    return null;
  }
}

// ── Quota helpers ─────────────────────────────────────────────────────────

/**
 * Quota pool info for the GLM API.
 */
interface QuotaPoolInfo {
  /** Human-readable label (e.g. "Coding", "Web", "Vision") */
  label: string;
  /** Current usage value — meaning depends on the pool type */
  used: number;
  /** Maximum capacity — meaning depends on the pool type */
  max: number;
  /** Pool type: "percent" for percentage, "count" for N/M, "time" for duration */
  type: 'percent' | 'count' | 'time';
}

/**
 * Format a QuotaPoolInfo for display.
 */
function formatQuotaPool(pool: QuotaPoolInfo): string {
  switch (pool.type) {
    case 'percent':
      return `${pool.label} ${pool.used}%`;
    case 'count':
      return `${pool.label} ${pool.used}/${pool.max}`;
    case 'time': {
      const totalMin = Math.floor(pool.used / 60);
      const hours = Math.floor(totalMin / 60);
      const minutes = totalMin % 60;
      return `${pool.label} ${hours}h ${minutes}m`;
    }
  }
}

/**
 * Renders the GLM quota line:
 *   Quota   Coding 78% │ Web 42/100 │ Vision 4h 51m
 */
const QuotaDisplay: React.FC<{ pools: QuotaPoolInfo[] }> = ({ pools }) => {
  if (pools.length === 0) return null;

  const parts = pools.map(formatQuotaPool);
  return (
    <Text wrap="truncate" color={theme.text.secondary}>
      Quota{'  '}
      {parts.join(' \u2502 ')}
    </Text>
  );
};

// ── Main Footer ───────────────────────────────────────────────────────────

export const Footer: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const { vimEnabled, vimMode } = useVimMode();
  const { lines: statusLineLines } = useStatusLine();
  const configInitMessage = useConfigInitMessage(uiState.isConfigInitialized);

  const promptTokenCount = uiState.sessionStats.lastPromptTokenCount;
  const { showAutoAcceptIndicator } = {
    showAutoAcceptIndicator: uiState.showAutoAcceptIndicator,
  };

  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);

  // Determine sandbox info from environment
  const sandboxEnv = process.env['SANDBOX'];
  const sandboxInfo = sandboxEnv
    ? sandboxEnv === 'sandbox-exec'
      ? 'seatbelt'
      : sandboxEnv.startsWith('glm-code')
        ? 'docker'
        : sandboxEnv
    : null;

  // Check if debug mode is enabled
  const debugMode = config.getDebugMode();

  const contextWindowSize =
    config.getContentGeneratorConfig()?.contextWindowSize;

  // Hide "? for shortcuts" when a custom status line is active
  const suppressHint = statusLineLines.length > 0;

  // ── HUD line data ────────────────────────────────────────────────────

  const rawModel = uiState.currentModel ?? '';
  const modelLabel = rawModel
    ? rawModel.replace(/^models\//, '').toUpperCase()
    : 'GLM';

  const cwd = process.cwd();
  const cwdBasename = cwd.split('/').pop() ?? cwd;
  const gitInfo = getGitInfo(cwd);

  const contextPct =
    contextWindowSize && contextWindowSize > 0 && promptTokenCount > 0
      ? ((promptTokenCount / contextWindowSize) * 100).toFixed(1)
      : null;
  const contextWindowLabel = contextWindowSize
    ? fmtK(contextWindowSize)
    : '200K';

  let contextColor: string;
  if (contextPct === null) {
    contextColor = theme.text.secondary;
  } else {
    const pct = parseFloat(contextPct);
    if (pct > 80) {
      contextColor = theme.status.error;
    } else if (pct > 50) {
      contextColor = theme.status.warning;
    } else {
      contextColor = theme.status.success;
    }
  }

  const showFullPath = terminalWidth >= 60;
  const pathDisplay = truncateMiddle(cwd, 30);
  const sep = ' \u00B7 ';

  // ── Quota pools ──────────────────────────────────────────────────────

  const quotaPools: QuotaPoolInfo[] = [];
  const codingUsed = process.env['GLM_QUOTA_CODING_USED'];
  const codingMax = process.env['GLM_QUOTA_CODING_MAX'];
  if (codingUsed && codingMax) {
    quotaPools.push({
      label: 'Coding',
      used: parseInt(codingUsed, 10),
      max: parseInt(codingMax, 10),
      type: 'percent',
    });
  }
  const webUsed = process.env['GLM_QUOTA_WEB_USED'];
  const webMax = process.env['GLM_QUOTA_WEB_MAX'];
  if (webUsed && webMax) {
    quotaPools.push({
      label: 'Web',
      used: parseInt(webUsed, 10),
      max: parseInt(webMax, 10),
      type: 'count',
    });
  }
  const visionUsed = process.env['GLM_QUOTA_VISION_SECONDS'];
  if (visionUsed) {
    quotaPools.push({
      label: 'Vision',
      used: parseInt(visionUsed, 10),
      max: 0,
      type: 'time',
    });
  }

  // ── Left-bottom content (hints / mode indicators) ────────────────────

  const leftBottomContent = uiState.ctrlCPressedOnce ? (
    <Text color={theme.status.warning}>{t('Press Ctrl+C again to exit.')}</Text>
  ) : uiState.ctrlDPressedOnce ? (
    <Text color={theme.status.warning}>{t('Press Ctrl+D again to exit.')}</Text>
  ) : uiState.showEscapePrompt ? (
    <Text color={theme.text.secondary}>{t('Press Esc again to clear.')}</Text>
  ) : uiState.rewindEscPending ? (
    <Text color={theme.text.secondary}>
      {t('Press Esc again to rewind conversation.')}
    </Text>
  ) : vimEnabled && vimMode === 'INSERT' ? (
    <Text color={theme.text.secondary}>-- INSERT --</Text>
  ) : uiState.shellModeActive ? (
    <ShellModeIndicator />
  ) : configInitMessage ? (
    <Text color={theme.text.secondary}>
      <GeminiSpinner /> {configInitMessage}
    </Text>
  ) : showAutoAcceptIndicator !== undefined &&
    showAutoAcceptIndicator !== ApprovalMode.DEFAULT ? (
    <AutoAcceptIndicator approvalMode={showAutoAcceptIndicator} />
  ) : suppressHint ? null : (
    <Text color={theme.text.secondary}>{t('? for shortcuts')} · Ctrl+G Dashboard</Text>
  );

  // Right-side indicators (sandbox, debug)
  const rightItems: Array<{ key: string; node: React.ReactNode }> = [];
  if (sandboxInfo) {
    rightItems.push({
      key: 'sandbox',
      node: <Text color={theme.status.success}>🔒 {sandboxInfo}</Text>,
    });
  }
  if (debugMode) {
    rightItems.push({
      key: 'debug',
      node: <Text color={theme.status.warning}>Debug Mode</Text>,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" width="100%" paddingX={2}>
      {/* Line 1: Pi-style HUD */}
      <Box marginX={0}>
        <Text wrap="truncate">
          <Text bold color={theme.text.accent}>
            GLM {'>'}
          </Text>
          <Text color={theme.text.secondary}>{' '}</Text>
          <Text color={theme.text.primary}>{'\u2B22'}</Text>
          <Text color={theme.text.primary}> {modelLabel}</Text>
          <Text color={theme.text.secondary}>{sep}</Text>
          <Text color={theme.text.primary}>{'\u25C9'}</Text>
          <Text color={theme.text.primary}> {cwdBasename}</Text>
          {showFullPath && (
            <>
              <Text color={theme.text.secondary}>{' > '}</Text>
              <Text color={theme.text.primary}>{'\uD83D\uDCC1'}</Text>
              <Text color={theme.text.primary}> {pathDisplay}</Text>
            </>
          )}
          {gitInfo && (
            <>
              <Text color={theme.text.secondary}>{' > '}</Text>
              <Text color={theme.text.primary}>{'\u2682'}</Text>
              <Text color={theme.text.primary}> {gitInfo.branch}</Text>
              {gitInfo.staged > 0 && (
                <Text color={theme.status.success}>
                  {' *'}
                  {gitInfo.staged}
                </Text>
              )}
              {gitInfo.untracked > 0 && (
                <Text color={theme.status.warning}>
                  {' ?'}
                  {gitInfo.untracked}
                </Text>
              )}
            </>
          )}
          <Text color={theme.text.secondary}>{' > '}</Text>
          <Text color={contextColor}>{'\u25EB'}</Text>
          <Text color={contextColor}>
            {' '}
            {contextPct ?? '--'}/{contextWindowLabel}
          </Text>
        </Text>
      </Box>

      {/* Line 2: Quota (if available) */}
      {quotaPools.length > 0 && <QuotaDisplay pools={quotaPools} />}

      {/* Line 3: Status line + hints/mode indicators */}
      <Box
        flexDirection={isNarrow ? 'column' : 'row'}
        justifyContent={isNarrow ? 'flex-start' : 'space-between'}
        width="100%"
        gap={isNarrow ? 0 : 1}
      >
        <Box flexDirection="column" flexShrink={isNarrow ? 0 : 1}>
          {statusLineLines.length > 0 &&
            !uiState.ctrlCPressedOnce &&
            !uiState.ctrlDPressedOnce &&
            statusLineLines.map((line, i) => (
              <Text key={`status-line-${i}`} dimColor wrap="truncate">
                {line}
              </Text>
            ))}
          <Box flexDirection="row" flexShrink={1}>
            <Text wrap="truncate">{leftBottomContent}</Text>
            <BackgroundTasksPill />
            <MCPHealthPill />
          </Box>
        </Box>

        {rightItems.length > 0 && (
          <Box flexShrink={0} gap={1} alignItems="flex-start">
            {rightItems.map(({ key, node }, index) => (
              <Box key={key} alignItems="center">
                {index > 0 && <Text color={theme.text.secondary}> | </Text>}
                {node}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
