/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tool tier classification for yolo mode.
 * Tools are classified into 3 tiers:
 *   A — Always auto-approve (read-only, no side effects)
 *   B — Auto-approve in workspace (edits, writes, bash in project)
 *   C — Hard whitelist (destructive, external) — always require confirmation
 */

/** Permission tier for auto-approval classification. */
export type PermissionTier = 'A' | 'B' | 'C';

/** Yolo mode level. */
export type YoloMode = 'off' | 'safe' | 'tier-b' | 'full';

/** Tool name to tier mapping. */
const TOOL_TIERS: Record<string, PermissionTier> = {
  // TIER A — Always auto-approve (read-only, no side effects)
  Read: 'A',
  Glob: 'A',
  Grep: 'A',
  LSP: 'A',
  WebSearch: 'A',
  Memory_recall: 'A',
  ToolSearch: 'A',
  ReadFile: 'A',
  ListFiles: 'A',

  // TIER B — Auto-approve in workspace (edits, writes, bash in project)
  Edit: 'B',
  Write: 'B',
  Bash: 'B',
  Task: 'B',
  Memory_retain: 'B',
  Commit: 'B',
  WriteFile: 'B',

  // TIER C — Hard whitelist (destructive, external)
  Shell: 'C',
  WebFetch: 'C',
  MCP: 'C',
};

/** Default tier for unknown tools. */
const DEFAULT_TIER: PermissionTier = 'C';

/**
 * Get the permission tier for a tool.
 */
export function getToolTier(toolName: string): PermissionTier {
  return TOOL_TIERS[toolName] ?? DEFAULT_TIER;
}

/**
 * Determine whether a tool should be auto-approved based on yolo mode.
 *
 * @param toolName - Name of the tool being called
 * @param yoloMode - Current yolo mode setting
 * @param isWorkspaceFile - Whether the target file is within the workspace
 * @returns true if the tool should be auto-approved
 */
export function shouldAutoApprove(
  toolName: string,
  yoloMode: YoloMode,
  isWorkspaceFile: boolean,
): boolean {
  if (yoloMode === 'full') return true;
  if (yoloMode === 'off') return false;

  const tier = getToolTier(toolName);

  // Tier A is always safe to auto-approve
  if (tier === 'A') return true;

  // Tier B is auto-approved when in tier-b mode AND file is in workspace
  if (tier === 'B' && yoloMode === 'tier-b' && isWorkspaceFile) return true;

  // Everything else requires confirmation
  return false;
}

/**
 * Parse a yolo mode string from CLI args or settings.
 * `--yolo` → 'tier-b', `--yolo=full` → 'full', `--yolo=safe` → 'safe'.
 */
export function parseYoloMode(raw: string | boolean | undefined): YoloMode {
  if (raw === undefined || raw === false) return 'off';
  if (raw === true || raw === 'tier-b') return 'tier-b';
  if (raw === 'safe') return 'safe';
  if (raw === 'full') return 'full';
  return 'tier-b'; // default for unrecognized truthy values
}

/**
 * Get all tools in a specific tier.
 */
export function getToolsInTier(tier: PermissionTier): string[] {
  return Object.entries(TOOL_TIERS)
    .filter(([, t]) => t === tier)
    .map(([name]) => name);
}
