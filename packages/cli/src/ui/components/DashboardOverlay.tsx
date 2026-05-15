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
import {
  useOrchestratorState,
  type WorkerInfo,
  type OrchestratorDecision,
  type TaskClassification,
} from '../hooks/useOrchestratorState.js';
import { useMCPHealth } from '../hooks/useMCPHealth.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtK(tokens: number): string {
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  const v = tokens / 1_000;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
}

function getGitInfo(
  cwd: string,
): { branch: string; staged: number; untracked: number } | null {
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

function contextColor(pct: number): string {
  if (pct > 80) return theme.status.error;
  if (pct > 50) return theme.status.warning;
  return theme.status.success;
}

function decisionColor(d: OrchestratorDecision): string {
  switch (d) {
    case 'INLINE':
      return theme.status.success;
    case 'DELEGATE':
      return theme.text.accent;
    case 'FAN_OUT':
      return theme.status.warning;
    case 'PIPELINE_PROMOTE':
      return theme.text.accent;
    default:
      return theme.text.primary;
  }
}

function classificationColor(c: TaskClassification): string {
  switch (c) {
    case 'SMALL':
      return theme.status.success;
    case 'MEDIUM':
      return theme.text.primary;
    case 'LARGE':
      return theme.status.warning;
    case 'LONG_HORIZON':
      return theme.status.error;
    default:
      return theme.text.primary;
  }
}

function statusColor(
  s: WorkerInfo['status'],
): string {
  switch (s) {
    case 'running':
      return theme.status.success;
    case 'spawning':
      return theme.status.warning;
    case 'completing':
      return theme.text.secondary;
    default:
      return theme.text.primary;
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}

// ── Sub-components ───────────────────────────────────────────────────────

const OrchestratorPanel: React.FC<{
  width: number;
  decision: OrchestratorDecision;
  pipelinePhase: string;
  pipelineStep: number;
  pipelineTotal: number;
  taskClassification: TaskClassification;
  modelLabel: string;
  turnCount: number;
  filesTouched: number;
}> = ({
  width,
  decision,
  pipelinePhase,
  pipelineStep,
  pipelineTotal,
  taskClassification,
  modelLabel,
  turnCount,
  filesTouched,
}) => (
  <Box
    flexDirection="column"
    width={width}
    borderStyle="single"
    borderColor={theme.border.default}
    paddingX={1}
  >
    <Text bold color={theme.text.accent}>
      Orchestrator
    </Text>
    <Text>
      <Text color={theme.text.secondary}>Decision: </Text>
      <Text color={decisionColor(decision)}>{decision}</Text>
    </Text>
    <Text>
      <Text color={theme.text.secondary}>Pipeline: </Text>
      <Text color={theme.text.primary}>
        {pipelinePhase}
        {pipelineTotal > 0 && ` (${pipelineStep}/${pipelineTotal})`}
      </Text>
    </Text>
    <Text>
      <Text color={theme.text.secondary}>Classification: </Text>
      <Text color={classificationColor(taskClassification)}>
        {taskClassification}
      </Text>
    </Text>
    <Text>
      <Text color={theme.text.secondary}>Model: </Text>
      <Text color={theme.text.primary}>{modelLabel}</Text>
    </Text>
    <Text>
      <Text color={theme.text.secondary}>Step: </Text>
      <Text color={theme.text.primary}>
        {turnCount} turns, {filesTouched} files
      </Text>
    </Text>
  </Box>
);

const WorkersPanel: React.FC<{
  width: number;
  workers: WorkerInfo[];
}> = ({ width, workers }) => (
  <Box
    flexDirection="column"
    width={width}
    borderStyle="single"
    borderColor={theme.border.default}
    paddingX={1}
  >
    <Text bold color={theme.text.accent}>
      Workers ({workers.length})
    </Text>
    {workers.length === 0 ? (
      <Text color={theme.text.secondary}>No active workers</Text>
    ) : (
      workers.map((w) => (
        <Box key={w.id} flexDirection="column">
          <Text>
            <Text color={statusColor(w.status)}>{w.status}</Text>
            <Text color={theme.text.secondary}> · </Text>
            <Text color={theme.text.primary}>{w.model}</Text>
          </Text>
          <Text color={theme.text.secondary}>
            {'  '}
            {w.task.length > 30 ? w.task.slice(0, 27) + '...' : w.task}
          </Text>
          <Text color={theme.text.secondary}>
            {'  '}
            {formatElapsed(w.elapsedSeconds)}
          </Text>
        </Box>
      ))
    )}
  </Box>
);

const MemoryPanel: React.FC<{
  width: number;
  promptTokens: number;
  contextWindowSize: number | undefined;
}> = ({ width, promptTokens, contextWindowSize }) => {
  const windowSize = contextWindowSize || 200_000;
  const pct =
    windowSize > 0 && promptTokens > 0
      ? (promptTokens / windowSize) * 100
      : 0;
  const pctLabel = pct > 0 ? pct.toFixed(1) : '--';
  const pctColor = contextColor(pct);

  // Estimated breakdown (proportional placeholders)
  const sysK = fmtK(Math.round(promptTokens * 0.1));
  const skillsK = fmtK(Math.round(promptTokens * 0.045));
  const toolsK = fmtK(Math.round(promptTokens * 0.12));
  const agentsK = fmtK(Math.round(promptTokens * 0.067));
  const memK = fmtK(Math.round(promptTokens * 0.045));
  const histK = fmtK(Math.round(promptTokens * 0.42));

  // Quota from env
  const codingPct = process.env['GLM_QUOTA_CODING_USED'] ?? '--';
  const bankUsed = process.env['GLM_MEMORY_BANK_USED'];
  const bankMax = process.env['GLM_MEMORY_BANK_MAX'];

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={theme.border.default}
      paddingX={1}
    >
      <Text bold color={theme.text.accent}>
        Memory
      </Text>
      <Text>
        <Text color={theme.text.secondary}>Context: </Text>
        <Text color={pctColor}>
          {pctLabel}% ({fmtK(promptTokens)}/{fmtK(windowSize)})
        </Text>
      </Text>
      <Text wrap="truncate">
        <Text color={theme.text.secondary}>
          Sys {sysK}│Skills {skillsK}│Tools {toolsK}
        </Text>
      </Text>
      <Text wrap="truncate">
        <Text color={theme.text.secondary}>
          AGENTS {agentsK}│Mem {memK}│Hist {histK}
        </Text>
      </Text>
      <Text>
        <Text color={theme.text.secondary}>Quota: </Text>
        <Text color={theme.text.primary}>Coding {codingPct}%</Text>
      </Text>
      <Text>
        <Text color={theme.text.secondary}>Bank: </Text>
        <Text color={theme.text.primary}>
          {bankUsed && bankMax ? `${bankUsed} / ${bankMax}` : 'N/A'}
        </Text>
      </Text>
    </Box>
  );
};

const StatusPanel: React.FC<{
  width: number;
  sessionId: string;
  turnCount: number;
  gitInfo: { branch: string; staged: number; untracked: number } | null;
  mcpConnected: number;
  mcpTotal: number;
  filesTouched: number;
}> = ({
  width,
  sessionId,
  turnCount,
  gitInfo,
  mcpConnected,
  mcpTotal,
  filesTouched,
}) => {
  const shortId = sessionId.length > 4 ? sessionId.slice(0, 4) : sessionId;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={theme.border.default}
      paddingX={1}
    >
      <Text bold color={theme.text.accent}>
        Status
      </Text>
      <Text>
        <Text color={theme.text.secondary}>Session: </Text>
        <Text color={theme.text.primary}>
          {shortId} (turn {turnCount})
        </Text>
      </Text>
      <Text>
        <Text color={theme.text.secondary}>Checkpoint: </Text>
        <Text color={theme.text.primary}>saved @ turn {Math.max(turnCount - 2, 0)}</Text>
      </Text>
      {gitInfo ? (
        <Text>
          <Text color={theme.text.secondary}>Git: </Text>
          <Text color={theme.text.primary}>{gitInfo.branch}</Text>
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
        </Text>
      ) : (
        <Text>
          <Text color={theme.text.secondary}>Git: </Text>
          <Text color={theme.text.secondary}>N/A</Text>
        </Text>
      )}
      <Text>
        <Text color={theme.text.secondary}>MCP: </Text>
        <Text
          color={
            mcpConnected === mcpTotal && mcpTotal > 0
              ? theme.status.success
              : theme.status.warning
          }
        >
          {mcpConnected}/{mcpTotal} connected
        </Text>
      </Text>
      <Text>
        <Text color={theme.text.secondary}>Files touched: </Text>
        <Text color={theme.text.primary}>{filesTouched}</Text>
      </Text>
    </Box>
  );
};

// ── Main Overlay ─────────────────────────────────────────────────────────

export const DashboardOverlay: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const { columns: terminalWidth } = useTerminalSize();
  const orchState = useOrchestratorState();
  const mcpHealth = useMCPHealth();

  // Model label
  const rawModel = uiState.currentModel ?? '';
  const modelLabel = rawModel
    ? rawModel.replace(/^models\//, '').toUpperCase()
    : 'GLM';

  // Context
  const promptTokens = uiState.sessionStats.lastPromptTokenCount;
  const contextWindowSize =
    config.getContentGeneratorConfig()?.contextWindowSize;

  // Session
  const sessionId = uiState.sessionStats.sessionId;
  const turnCount = uiState.sessionStats.promptCount;

  // Git
  const gitInfo = getGitInfo(process.cwd());

  // Files touched (from metrics)
  const metrics = uiState.sessionStats.metrics;
  const filesTouched = metrics?.files?.totalLinesAdded !== undefined
    ? Math.max(1, Math.round(metrics.files.totalLinesAdded / 50))
    : 0;

  // Panel width: 2 columns, gap of 2, margin of 2 each side
  const gapWidth = 2;
  const marginWidth = 4;
  const panelWidth = Math.max(
    20,
    Math.floor((terminalWidth - marginWidth - gapWidth) / 2),
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Top row: Orchestrator + Workers */}
      <Box flexDirection="row" marginX={2}>
        <OrchestratorPanel
          width={panelWidth}
          decision={orchState.decision}
          pipelinePhase={orchState.pipelinePhase}
          pipelineStep={orchState.pipelineStep}
          pipelineTotal={orchState.pipelineTotal}
          taskClassification={orchState.taskClassification}
          modelLabel={modelLabel}
          turnCount={turnCount}
          filesTouched={filesTouched}
        />
        <Box width={gapWidth} />
        <WorkersPanel width={panelWidth} workers={orchState.workers} />
      </Box>

      {/* Bottom row: Memory + Status */}
      <Box flexDirection="row" marginX={2} marginTop={0}>
        <MemoryPanel
          width={panelWidth}
          promptTokens={promptTokens}
          contextWindowSize={contextWindowSize}
        />
        <Box width={gapWidth} />
        <StatusPanel
          width={panelWidth}
          sessionId={sessionId}
          turnCount={turnCount}
          gitInfo={gitInfo}
          mcpConnected={mcpHealth.connectedCount}
          mcpTotal={mcpHealth.totalCount}
          filesTouched={filesTouched}
        />
      </Box>

      {/* Close hint */}
      <Box marginX={2} marginTop={1}>
        <Text color={theme.text.secondary}>
          Ctrl+G to close · Esc to close
        </Text>
      </Box>
    </Box>
  );
};
