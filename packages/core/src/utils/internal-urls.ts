/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Internal URL scheme resolver for the GLM Code harness.
 * Handles local://, agent://, artifact://, memory://, mcp://,
 * issue://, pr://, skill://, rule://, and conflict:// protocols.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
 import { execSync } from 'node:child_process';

const GLM_DIR = '.glm';
const PLANS_DIR = 'plans';
const SESSIONS_DIR = 'sessions';
const AGENTS_DIR = 'agents';
const ARTIFACTS_DIR = 'artifacts';

export interface ResolvedUrl {
  type: string;
  path: string;
  content?: string;
}

const INTERNAL_PROTOCOLS = [
  'local://',
  'agent://',
  'artifact://',
  'memory://',
  'mcp://',
  'issue://',
  'pr://',
  'skill://',
  'rule://',
  'conflict://',
] as const;


/**
 * Check if a string matches any internal URL protocol.
 */
export function isInternalUrl(str: string): boolean {
  const trimmed = str.trim();
  return INTERNAL_PROTOCOLS.some((proto) => trimmed.startsWith(proto));
}

function glmBaseDir(): string {
  return path.join(os.homedir(), GLM_DIR);
}

function resolveLocalUrl(url: string): ResolvedUrl {
  const name = url.slice('local://'.length);
  const resolvedPath = path.join(glmBaseDir(), PLANS_DIR, name);
  let content: string | undefined;
  try {
    content = fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    // File may not exist
  }
  return { type: 'local', path: resolvedPath, content };
}

function resolveAgentUrl(
  url: string,
  options?: { sessionId?: string },
): ResolvedUrl {
  const id = url.slice('agent://'.length);
  const sessionId = options?.sessionId ?? 'default';
  const resolvedPath = path.join(
    glmBaseDir(),
    SESSIONS_DIR,
    sessionId,
    AGENTS_DIR,
    `${id}.json`,
  );
  let content: string | undefined;
  try {
    content = fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    // File may not exist
  }
  return { type: 'agent', path: resolvedPath, content };
}

function resolveArtifactUrl(url: string): ResolvedUrl {
  const id = url.slice('artifact://'.length);
  const resolvedPath = path.join(glmBaseDir(), ARTIFACTS_DIR, id);
  let content: string | undefined;
  try {
    content = fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    // File may not exist
  }
  return { type: 'artifact', path: resolvedPath, content };
}

function resolveMemoryUrl(
  url: string,
  options?: { projectDir?: string },
): ResolvedUrl {
  // For memory://root, resolve to the project memory summary file
  const projectDir = options?.projectDir ?? process.cwd();
  const resolvedPath = path.join(projectDir, GLM_DIR, 'project-memory.json');
  let content: string | undefined;
  try {
    content = fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    // Fall back to global memory location
    const globalPath = path.join(glmBaseDir(), 'project-memory.json');
    try {
      content = fs.readFileSync(globalPath, 'utf-8');
    } catch {
      // No memory file found
    }
  }
  return { type: 'memory', path: resolvedPath, content };
}

function resolveMcpUrl(url: string): ResolvedUrl {
  const uri = url.slice('mcp://'.length);
  return {
    type: 'mcp',
    path: uri,
    content: JSON.stringify({ uri, protocol: 'mcp' }),
  };
}

function resolveIssueUrl(
  url: string,
  options?: { projectDir?: string },
): ResolvedUrl {
  let rest = url.slice('issue://'.length);
  let owner = '';
  let repo = '';
  let num = '';

  if (rest.includes('/')) {
    // issue://owner/repo/N or issue://owner/repo
    const parts = rest.split('/');
    owner = parts[0];
    repo = parts[1] ?? '';
    num = parts[2] ?? '';
  } else {
    // issue://N — derive owner/repo from git remote
    num = rest;
    try {
      // execSync is imported at module level
      const projectDir = options?.projectDir ?? process.cwd();
      const remote = execSync('git remote get-url origin', {
        cwd: projectDir,
        encoding: 'utf-8',
      }).trim();
      const match = remote.match(/[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    } catch {
      // Cannot determine git remote
    }
  }

  const ghUrl =
    owner && repo && num
      ? `https://github.com/${owner}/${repo}/issues/${num}`
      : num
        ? `https://github.com/issues/${num}`
        : `https://github.com`;

  return { type: 'issue', path: ghUrl, content: ghUrl };
}

function resolvePrUrl(
  url: string,
  options?: { projectDir?: string },
): ResolvedUrl {
  let rest = url.slice('pr://'.length);
  let owner = '';
  let repo = '';
  let num = '';

  if (rest.includes('/')) {
    const parts = rest.split('/');
    owner = parts[0];
    repo = parts[1] ?? '';
    num = parts[2] ?? '';
  } else {
    num = rest;
    try {
      // execSync is imported at module level
      const projectDir = options?.projectDir ?? process.cwd();
      const remote = execSync('git remote get-url origin', {
        cwd: projectDir,
        encoding: 'utf-8',
      }).trim();
      const match = remote.match(/[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    } catch {
      // Cannot determine git remote
    }
  }

  const ghUrl =
    owner && repo && num
      ? `https://github.com/${owner}/${repo}/pull/${num}`
      : num
        ? `https://github.com/pulls/${num}`
        : `https://github.com`;

  return { type: 'pr', path: ghUrl, content: ghUrl };
}

function resolveSkillUrl(url: string): ResolvedUrl {
  const name = url.slice('skill://'.length);
  // Check for sub-path: skill://name/path
  const slashIdx = name.indexOf('/');
  const skillName = slashIdx >= 0 ? name.slice(0, slashIdx) : name;
  const subPath = slashIdx >= 0 ? name.slice(slashIdx + 1) : '';

  // Look in project .glm/skills/ and global ~/.glm/skills/
  const candidates = [
    path.join(process.cwd(), GLM_DIR, 'skills', skillName),
    path.join(glmBaseDir(), 'skills', skillName),
  ];

  for (const candidate of candidates) {
    if (subPath) {
      const full = path.join(candidate, subPath);
      if (fs.existsSync(full)) {
        return { type: 'skill', path: full };
      }
    } else {
      if (fs.existsSync(candidate)) {
        return { type: 'skill', path: candidate };
      }
    }
  }

  return { type: 'skill', path: candidates[0] };
}

function resolveRuleUrl(url: string): ResolvedUrl {
  const name = url.slice('rule://'.length);
  const candidates = [
    path.join(process.cwd(), GLM_DIR, 'rules', `${name}.md`),
    path.join(glmBaseDir(), 'rules', `${name}.md`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      let content: string | undefined;
      try {
        content = fs.readFileSync(candidate, 'utf-8');
      } catch {
        // ignore
      }
      return { type: 'rule', path: candidate, content };
    }
  }

  return { type: 'rule', path: candidates[0] };
}

async function resolveConflictUrl(
  options?: { projectDir?: string },
): Promise<ResolvedUrl> {
  const projectDir = options?.projectDir ?? process.cwd();
  // execSync is imported at module level
  let conflicts: string[] = [];
  try {
    const output = execSync(
      'grep -rl "<<<<<<< " --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" .',
      { cwd: projectDir, encoding: 'utf-8' },
    ).trim();
    conflicts = output
      .split('\n')
      .filter((line: string) => line.length > 0);
  } catch {
    // No conflicts found (grep exits non-zero)
  }

  return {
    type: 'conflict',
    path: projectDir,
    content:
      conflicts.length > 0
        ? JSON.stringify({ conflicts })
        : undefined,
  };
}

/**
 * Resolve an internal URL to a filesystem path and optional content.
 */
export async function resolveInternalUrl(
  url: string,
  options?: { projectDir?: string; sessionId?: string },
): Promise<ResolvedUrl | null> {
  if (!isInternalUrl(url)) {
    return null;
  }

  const trimmed = url.trim();

  if (trimmed.startsWith('local://')) {
    return resolveLocalUrl(trimmed);
  }
  if (trimmed.startsWith('agent://')) {
    return resolveAgentUrl(trimmed, options);
  }
  if (trimmed.startsWith('artifact://')) {
    return resolveArtifactUrl(trimmed);
  }
  if (trimmed.startsWith('memory://')) {
    return resolveMemoryUrl(trimmed, options);
  }
  if (trimmed.startsWith('mcp://')) {
    return resolveMcpUrl(trimmed);
  }
  if (trimmed.startsWith('issue://')) {
    return resolveIssueUrl(trimmed, options);
  }
  if (trimmed.startsWith('pr://')) {
    return resolvePrUrl(trimmed, options);
  }
  if (trimmed.startsWith('skill://')) {
    return resolveSkillUrl(trimmed);
  }
  if (trimmed.startsWith('rule://')) {
    return resolveRuleUrl(trimmed);
  }
  if (trimmed.startsWith('conflict://')) {
    return resolveConflictUrl(options);
  }

  return null;
}
