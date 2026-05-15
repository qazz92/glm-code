/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { t } from '../../i18n/index.js';

// Unicode block characters for the progress bar
const FILLED = '\u25b0'; // ▰
const EMPTY = '\u2591'; // ░

/**
 * Format a token count as a compact human-readable string (e.g. 9K, 128K).
 */
function fmtK(tokens: number): string {
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(0)}K`;
  }
  return `${tokens}`;
}

/**
 * Context budget segment for the HUD display.
 */
export interface ContextBudgetSegment {
  /** Short label (e.g. "Sys", "Skills", "Tools") */
  label: string;
  /** Token count for this segment */
  tokens: number;
}

interface ContextUsageDisplayProps {
  promptTokenCount: number;
  terminalWidth: number;
  contextWindowSize: number;
  /** Optional breakdown of context segments. When provided, shows the full budget HUD. */
  segments?: ContextBudgetSegment[];
}

/**
 * Renders a single-line context budget breakdown:
 *   Context Sys 9K│Skills 4K│Tools 11K│AGENTS 6K│Mem 4K│Hist 38K│Free 128K
 * When `segments` is provided, also shows a progress bar underneath:
 *                  ▰▰▰░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  36% used
 *
 * Falls back to a compact percentage display when no segments are available
 * or the terminal is too narrow.
 */
export const ContextUsageDisplay = ({
  promptTokenCount,
  terminalWidth,
  contextWindowSize,
  segments,
}: ContextUsageDisplayProps) => {
  if (promptTokenCount === 0) {
    return null;
  }

  const percentage = promptTokenCount / contextWindowSize;
  const pctValue =
    percentage > 1 ? '>100' : (percentage * 100).toFixed(1);
  const isOverLimit = percentage > 1;

  // Without segments or on narrow terminals, use the compact single-line display
  const hasSegments = segments && segments.length > 0;
  if (!hasSegments || terminalWidth < 100) {
    const label = terminalWidth < 100 ? t('% used') : t('% context used');
    if (isOverLimit) {
      return (
        <Text color={theme.status.error}>
          {pctValue}
          {label}
        </Text>
      );
    }
    return (
      <Text color={theme.text.secondary}>
        {pctValue}
        {label}
      </Text>
    );
  }

  // Build the segment string: "Sys 9K│Skills 4K│Tools 11K│..."
  const usedTokens = segments.reduce((sum, s) => sum + s.tokens, 0);
  const freeTokens = Math.max(0, contextWindowSize - usedTokens);

  const parts = [
    ...segments.map((s) => `${s.label} ${fmtK(s.tokens)}`),
    `Free ${fmtK(freeTokens)}`,
  ];
  const segmentLine = `Context ${parts.join('\u2502')}`;

  // Build the progress bar
  const barWidth = Math.min(40, terminalWidth - 20);
  const usedPct = Math.min(100, (usedTokens / contextWindowSize) * 100);
  const filledCount = Math.round((usedPct / 100) * barWidth);
  const emptyCount = Math.max(0, barWidth - filledCount);
  const barStr = `${FILLED.repeat(filledCount)}${EMPTY.repeat(emptyCount)}`;

  let usedColor = theme.text.accent;
  if (usedPct > 80) {
    usedColor = theme.status.error;
  } else if (usedPct > 60) {
    usedColor = theme.status.warning;
  }

  return (
    <Box flexDirection="column">
      <Text wrap="truncate" color={theme.text.secondary}>
        {segmentLine}
      </Text>
      <Box>
        <Text color={usedColor}>{barStr}</Text>
        <Text color={theme.text.secondary}>{'  '}</Text>
        <Text color={isOverLimit ? theme.status.error : theme.text.secondary}>
          {pctValue}% context used
        </Text>
      </Box>
    </Box>
  );
};
