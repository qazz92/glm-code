/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { execSync } from 'child_process';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

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
        // Staged: index has changes (M, A, D, R, C in X position)
        if (x === 'M' || x === 'A' || x === 'D' || x === 'R' || x === 'C') {
          staged++;
        }
        // Untracked: ?? in XY positions
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

/**
 * Compact single-line Pi-style HUD.
 *
 * Format:
 *   GLM > ⬢ GLM-5.1 · ◉ {cwd basename} > 📁 {cwd} > ⑂ {branch} *{staged} ?{untracked} > ◫ {pct}/{window}
 */
export const GLMDashboard: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const { columns: terminalWidth } = useTerminalSize();

  // Model
  const rawModel = uiState.currentModel ?? '';
  const modelLabel = rawModel
    ? rawModel.replace(/^models\//, '').toUpperCase()
    : 'GLM';

  // CWD
  const cwd = process.cwd();
  const cwdBasename = cwd.split('/').pop() ?? cwd;

  // Git info (synchronous, cached per render)
  const gitInfo = getGitInfo(cwd);

  // Context budget
  const promptTokens = uiState.sessionStats.lastPromptTokenCount;
  const contextWindowSize =
    config.getContentGeneratorConfig()?.contextWindowSize;

  const contextPct =
    contextWindowSize && contextWindowSize > 0 && promptTokens > 0
      ? ((promptTokens / contextWindowSize) * 100).toFixed(1)
      : null;
  const contextWindowLabel = contextWindowSize
    ? fmtK(contextWindowSize)
    : '200K';

  // Context color
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

  // Separator
  const sep = ' \u00B7 ';

  // Narrow terminal: skip full path
  const showFullPath = terminalWidth >= 60;
  const pathDisplay = truncateMiddle(cwd, 30);

  return (
    <Box marginX={2}>
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
  );
};
