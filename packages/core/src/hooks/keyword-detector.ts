/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * KeywordDetector scans user prompts for patterns that map to
 * built-in workflow commands. When detected, it returns the
 * matching workflow name for auto-activation.
 */

export interface KeywordMatch {
  workflow: string;
  keyword: string;
  notification?: string;
}

/**
 * Delegation category configuration for model routing.
 */
export interface DelegationCategory {
  temperature: number;
  thinking: string;
  model: string;
  agent: string | null;
}

/**
 * Keyword → delegation category mapping.
 * Maps keyword domains to model/temperature/thinking configurations.
 */
export const DELEGATION_CATEGORIES: Record<string, DelegationCategory> = {
  'visual-engineering': {
    temperature: 0.7,
    thinking: 'medium',
    model: 'GLM-5.1',
    agent: 'designer',
  },
  ultrabrain: {
    temperature: 0.3,
    thinking: 'high',
    model: 'GLM-5.1',
    agent: null,
  },
  artistry: {
    temperature: 0.9,
    thinking: 'low',
    model: 'GLM-5.1',
    agent: null,
  },
  quick: {
    temperature: 0.4,
    thinking: 'off',
    model: 'GLM-4.5-Air',
    agent: null,
  },
  writing: {
    temperature: 0.5,
    thinking: 'low',
    model: 'GLM-5-Turbo',
    agent: 'writer',
  },
  precision: {
    temperature: 0.0,
    thinking: 'high',
    model: 'GLM-5.1',
    agent: 'executor',
  },
};

/**
 * Keyword → category association for delegation routing.
 */
const KEYWORD_CATEGORY_MAP: Array<[RegExp, string]> = [
  [/\bdesign\b|\bui\b|\bux\b|\bfrontend\b|\bcomponent\b|\bvisual\b/i, 'visual-engineering'],
  [/\bthink\b.*\bdeep|\banalyz\b.*\bcomplex|\barchitect\b/i, 'ultrabrain'],
  [/\bcreative\b|\bwrit\b.*\bpoem|\bstor(?:y|ies)\b|\bimagina/i, 'artistry'],
  [/\bquick\b|\bfast\b|\bsimpl(?:e|ify)\b|\bminor\b/i, 'quick'],
  [/\bdocument\b|\bwrite\b|\bblog\b|\breadme\b|\bexplai/i, 'writing'],
  [/\bprecis(?:e|ion)\b|\bexact\b|\bverif\b|\bdetermin/i, 'precision'],
];

/**
 * Get the delegation category for a detected keyword.
 */
export function getCategoryForKeyword(
  keyword: string,
): DelegationCategory | null {
  for (const [pattern, category] of KEYWORD_CATEGORY_MAP) {
    if (pattern.test(keyword)) {
      return DELEGATION_CATEGORIES[category] ?? null;
    }
  }
  return null;
}

/**
 * Extract code blocks (```...```) and URLs from a prompt
 * so they can be excluded from keyword matching.
 */
function extractExcludedRegions(prompt: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];

  // Code blocks: ```...```
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(prompt)) !== null) {
    regions.push([match.index, match.index + match[0].length]);
  }

  // Inline code: `...`
  const inlineCodeRegex = /`[^`]+`/g;
  while ((match = inlineCodeRegex.exec(prompt)) !== null) {
    regions.push([match.index, match.index + match[0].length]);
  }

  // URLs
  const urlRegex = /https?:\/\/\S+/g;
  while ((match = urlRegex.exec(prompt)) !== null) {
    regions.push([match.index, match.index + match[0].length]);
  }

  return regions;
}

/**
 * Check if a position in the prompt falls within an excluded region.
 */
function isInExcludedRegion(
  pos: number,
  regions: Array<[number, number]>,
): boolean {
  for (const [start, end] of regions) {
    if (pos >= start && pos < end) return true;
  }
  return false;
}

/**
 * Keyword → workflow mapping table.
 * Each entry is a [regex_pattern, workflow_name] pair.
 * Patterns are case-insensitive.
 */
const KEYWORD_MAP: Array<[RegExp, string]> = [
  [/\bautopilot\b/i, 'autopilot'],
  [/\brale?ph\b/i, 'ralph'],
  [/\bulw\b|\bultrawork\b/i, 'ultrawork'],
  [/\bteam\b.*\bagent\b|\bteam\b.*\bparallel\b|\bmultiple\s+agents\b/i, 'team'],
  [/\bstrategic\s*plan\b|\brale?plan\b/i, 'strategic-plan'],
  [/\bdeep[- ]?dive\b|\binvestigat\b.*\broot[- ]?cause\b/i, 'deep-dive'],
  [/\btrace\b.*\bcaus|\bevidence[- ]?driven\b/i, 'trace'],
  [/\bultra[- ]?qa\b|\bqa\s+cycle\b/i, 'ultraqa'],
  [/\bdebug\b.*\bsession\b|\bdebug\b.*\brepo\b|\bdebug\b.*\bdiagnos/i, 'debug'],
  [/\bverify\b.*\bcomplet|\bverify\b.*\bclaim|\bverify\b.*\bwork\b/i, 'verify'],
  [/\byolo\s+mode\b|\byolo\s+(conservative|moderate|full)\b/i, 'yolo'],
  [/\braplan\b/i, 'ralplan'],
  [/\bself[- ]?improve\b/i, 'self-improve'],
  [/\bcritic\b.*\breview|\bcritique\b/i, 'critic'],
  [/\bskillify\b|\bmake\s+skill\b/i, 'skillify'],
];

/**
 * Detect workflow keywords in a user prompt.
 * Returns the first matching workflow name, or null if no match.
 *
 * Short-circuits when:
 * - The prompt starts with `/no-keyword` or `/nk`
 * - The prompt starts with `/` (slash command bypass)
 * - `options.disabled` is true
 *
 * Excludes code blocks and URLs from matching.
 */
export function detectWorkflowKeyword(
  prompt: string,
  options?: { disabled?: boolean },
): KeywordMatch | null {
  if (options?.disabled) {
    return null;
  }
  const trimmed = prompt.trimStart();
  if (trimmed.startsWith('/no-keyword') || trimmed.startsWith('/nk')) {
    return null;
  }
  // Slash command bypass: if prompt starts with '/', skip detection
  if (trimmed.startsWith('/')) {
    return null;
  }

  const excludedRegions = extractExcludedRegions(prompt);

  for (const [pattern, workflow] of KEYWORD_MAP) {
    const match = pattern.exec(prompt);
    if (match !== null && !isInExcludedRegion(match.index, excludedRegions)) {
      const keyword = match[0];
      return {
        workflow,
        keyword,
        notification: `🔮 detected '${keyword}' → activating /${workflow}`,
      };
    }
  }
  return null;
}

/**
 * Get all supported workflow keyword patterns.
 * Useful for help text and documentation.
 */
export function getSupportedKeywords(): Array<{ pattern: string; workflow: string }> {
  return KEYWORD_MAP.map(([pattern, workflow]) => ({
    pattern: pattern.source,
    workflow,
  }));
}
