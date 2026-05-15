/**
 * Memory tools — retain, recall, reflect.
 *
 * Provides three LLM-callable tools for persisting and retrieving knowledge
 * across sessions.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { FunctionDeclaration } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Storage } from '../config/storage.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('MEMORY_TOOLS');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMORY_BANK_DIR = 'memory/bank';
const MAX_FILE_SIZE = 4 * 1024; // 4 KB cap

function getMemoryBankDir(): string {
  return path.join(Storage.getGlobalGLMDir(), MEMORY_BANK_DIR);
}

/** Sanitize text into a safe filename (first 50 chars). */
function sanitizeTopic(text: string): string {
  return text
    .slice(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Build YAML frontmatter + markdown body. */
function formatMemoryFile(
  body: string,
  type: string,
  scope: string,
  created: string,
  expires?: string,
): string {
  const lines: string[] = ['---'];
  lines.push(`type: ${type}`);
  lines.push(`scope: ${scope}`);
  lines.push(`created: ${created}`);
  if (expires) lines.push(`expires: ${expires}`);
  lines.push('---');
  lines.push('');
  lines.push(body);
  return lines.join('\n');
}

/** Parse YAML frontmatter from a memory file. Returns null on failure. */
function parseFrontmatter(
  content: string,
): { meta: Record<string, string>; body: string } | null {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('---', 3);
  if (end === -1) return null;
  const frontmatter = content.slice(3, end).trim();
  const body = content.slice(end + 3).trim();
  const meta: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { meta, body };
}

/** Enforce 4 KB cap by truncating oldest entries (separated by `---` dividers). */
async function enforceCap(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= MAX_FILE_SIZE) return;

    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed) return;

    // Split body into entries separated by horizontal rules
    const entries = parsed.body.split(/\n---\n/);
    // Drop oldest entries until we fit
    while (entries.length > 1) {
      const size =
        parsed.meta['type'].length +
        parsed.meta['scope'].length +
        entries.join('\n---\n').length +
        64; // overhead
      if (size <= MAX_FILE_SIZE) break;
      entries.shift();
    }

    const newContent = formatMemoryFile(
      entries.join('\n---\n'),
      parsed.meta['type'] ?? 'reference',
      parsed.meta['scope'] ?? 'session',
      parsed.meta['created'] ?? new Date().toISOString(),
      parsed.meta['expires'],
    );
    await fs.writeFile(filePath, newContent, 'utf-8');
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Memory_retain
// ---------------------------------------------------------------------------

export interface MemoryRetainParams {
  text: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  scope: 'session' | 'project' | 'global';
}

const memoryRetainSchema: FunctionDeclaration = {
  name: 'Memory_retain',
  description:
    'Persist a piece of knowledge to the memory bank for later recall. ' +
    'Writes a markdown file with YAML frontmatter under ~/.glm/memory/bank/.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The knowledge or observation to retain.',
      },
      type: {
        type: 'string',
        enum: ['user', 'feedback', 'project', 'reference'],
        description:
          'Category of the memory: user (preference), feedback (correction), project (architecture), reference (API/pattern).',
      },
      scope: {
        type: 'string',
        enum: ['session', 'project', 'global'],
        description: 'Visibility scope of the memory.',
      },
    },
    required: ['text', 'type', 'scope'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

class MemoryRetainInvocation extends BaseToolInvocation<
  MemoryRetainParams,
  ToolResult
> {
  getDescription(): string {
    return `Retain memory: ${this.params.text.slice(0, 60)}…`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { text, type, scope } = this.params;
    const bankDir = getMemoryBankDir();

    try {
      await fs.mkdir(bankDir, { recursive: true });

      const topic = sanitizeTopic(text) || 'memory';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${topic}-${timestamp}.md`;
      const filePath = path.join(bankDir, filename);

      const content = formatMemoryFile(text, type, scope, new Date().toISOString());

      await fs.writeFile(filePath, content, 'utf-8');
      await enforceCap(filePath);

      debugLogger.debug(`Retained memory to ${filePath}`);
      return {
        llmContent: `Memory retained successfully.\nFile: ${filePath}\nType: ${type}\nScope: ${scope}`,
        returnDisplay: `Retained to ${filename}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`Memory retain failed: ${msg}`);
      return {
        llmContent: `Failed to retain memory: ${msg}`,
        returnDisplay: `Error: ${msg}`,
      };
    }
  }
}

export class MemoryRetainTool extends BaseDeclarativeTool<
  MemoryRetainParams,
  ToolResult
> {
  static readonly Name = 'Memory_retain';

  constructor() {
    super(
      MemoryRetainTool.Name,
      'MemoryRetain',
      memoryRetainSchema.description!,
      Kind.Think,
      memoryRetainSchema.parametersJsonSchema as Record<string, unknown>,
    );
  }

  protected createInvocation(
    params: MemoryRetainParams,
  ): ToolInvocation<MemoryRetainParams, ToolResult> {
    return new MemoryRetainInvocation(params);
  }
}

// ---------------------------------------------------------------------------
// Memory_recall
// ---------------------------------------------------------------------------

export interface MemoryRecallParams {
  query: string;
  limit?: number;
}

const memoryRecallSchema: FunctionDeclaration = {
  name: 'Memory_recall',
  description:
    'Search the memory bank for previously retained knowledge. ' +
    'Returns ranked results based on keyword match, recency, and scope.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to match against stored memories.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 10).',
      },
    },
    required: ['query'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

interface ScoredResult {
  filePath: string;
  fileName: string;
  meta: Record<string, string>;
  body: string;
  score: number;
  mtime: number;
}

class MemoryRecallInvocation extends BaseToolInvocation<
  MemoryRecallParams,
  ToolResult
> {
  getDescription(): string {
    return `Recall memories matching: ${this.params.query}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { query, limit = 10 } = this.params;
    const bankDir = getMemoryBankDir();

    try {
      await fs.mkdir(bankDir, { recursive: true });

      const files = await fs.readdir(bankDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      if (mdFiles.length === 0) {
        return {
          llmContent: 'No memories found. The memory bank is empty.',
          returnDisplay: 'No memories found.',
        };
      }

      const queryLower = query.toLowerCase();
      const queryTerms = queryLower.split(/\s+/).filter(Boolean);
      const scopeWeight: Record<string, number> = {
        global: 3,
        project: 2,
        session: 1,
      };

      const scored: ScoredResult[] = [];

      for (const fileName of mdFiles) {
        const filePath = path.join(bankDir, fileName);
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath),
        ]);

        const parsed = parseFrontmatter(content);
        if (!parsed) continue;

        // Keyword match score
        const bodyLower = parsed.body.toLowerCase();
        let matchCount = 0;
        for (const term of queryTerms) {
          if (bodyLower.includes(term)) matchCount++;
        }

        // Recency score (seconds ago, inverted)
        const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
        const recencyScore = Math.max(0, 1 - ageSeconds / (7 * 24 * 3600)); // decay over 7 days

        // Scope relevance
        const scopeScore =
          scopeWeight[parsed.meta['scope'] ?? 'session'] ?? 1;

        const score = matchCount * 10 + recencyScore * 5 + scopeScore;

        if (matchCount > 0 || score > 2) {
          scored.push({
            filePath,
            fileName,
            meta: parsed.meta,
            body: parsed.body,
            score,
            mtime: stat.mtimeMs,
          });
        }
      }

      // Sort by score descending, then by recency
      scored.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
      const results = scored.slice(0, limit);

      if (results.length === 0) {
        return {
          llmContent: `No memories matched query: "${query}"`,
          returnDisplay: 'No matching memories.',
        };
      }

      const lines = results.map(
        (r, i) =>
          `${i + 1}. **${r.meta['type'] ?? 'unknown'}** (${r.meta['scope'] ?? 'session'}) — ${r.body.slice(0, 200)}`,
      );

      return {
        llmContent: `Found ${results.length} matching memories:\n\n${lines.join('\n')}`,
        returnDisplay: `${results.length} memories recalled`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`Memory recall failed: ${msg}`);
      return {
        llmContent: `Failed to recall memories: ${msg}`,
        returnDisplay: `Error: ${msg}`,
      };
    }
  }
}

export class MemoryRecallTool extends BaseDeclarativeTool<
  MemoryRecallParams,
  ToolResult
> {
  static readonly Name = 'Memory_recall';

  constructor() {
    super(
      MemoryRecallTool.Name,
      'MemoryRecall',
      memoryRecallSchema.description!,
      Kind.Search,
      memoryRecallSchema.parametersJsonSchema as Record<string, unknown>,
      true, // isOutputMarkdown
      false, // canUpdateOutput
      true, // shouldDefer — recall is infrequent, discoverable via ToolSearch
    );
  }

  protected createInvocation(
    params: MemoryRecallParams,
  ): ToolInvocation<MemoryRecallParams, ToolResult> {
    return new MemoryRecallInvocation(params);
  }
}

// ---------------------------------------------------------------------------
// Memory_reflect
// ---------------------------------------------------------------------------

export interface MemoryReflectParams {
  turnSummary?: string;
}

const memoryReflectSchema: FunctionDeclaration = {
  name: 'Memory_reflect',
  description:
    'Analyse recent context to extract potential learnings. Detects patterns ' +
    'like error resolutions, new techniques, architecture decisions, and API usage. ' +
    'Returns suggested retain candidates.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      turnSummary: {
        type: 'string',
        description:
          'Optional summary of the recent turn/context to reflect on.',
      },
    },
    required: [],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

interface ReflectionCandidate {
  text: string;
  type: MemoryRetainParams['type'];
  scope: MemoryRetainParams['scope'];
  reasoning: string;
}

const REFLECTION_PATTERNS: {
  regex: RegExp;
  type: MemoryRetainParams['type'];
  label: string;
}[] = [
  {
    regex: /(?:fix|fixed|resolved|error|bug|issue|problem|failure|exception|traceback|stack\s+trace)/i,
    type: 'feedback',
    label: 'Error resolution',
  },
  {
    regex: /(?:learned|pattern|practice|convention|standard|approach|technique|best\s+practice)/i,
    type: 'reference',
    label: 'New pattern learned',
  },
  {
    regex: /(?:architect|design|decided|decision|structure|module|component|layer|service|system)/i,
    type: 'project',
    label: 'Architecture decision',
  },
  {
    regex: /(?:api|endpoint|sdk|library|package|method|function|class|interface|type|interface|module)/i,
    type: 'reference',
    label: 'API usage',
  },
];

class MemoryReflectInvocation extends BaseToolInvocation<
  MemoryReflectParams,
  ToolResult
> {
  getDescription(): string {
    return 'Reflect on recent context for potential learnings';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { turnSummary } = this.params;
    const text = turnSummary ?? '';

    if (!text.trim()) {
      return {
        llmContent:
          'No turn summary provided. Pass a `turnSummary` with the recent context to get reflection candidates.',
        returnDisplay: 'No input to reflect on.',
      };
    }

    const candidates: ReflectionCandidate[] = [];

    for (const pattern of REFLECTION_PATTERNS) {
      if (pattern.regex.test(text)) {
        candidates.push({
          text: text.slice(0, 200),
          type: pattern.type,
          scope: 'global',
          reasoning: `Detected ${pattern.label.toLowerCase()} pattern in context.`,
        });
      }
    }

    if (candidates.length === 0) {
      return {
        llmContent:
          'No strong learning patterns detected in the provided context. ' +
          'Consider providing a more detailed turnSummary if there was a meaningful insight.',
        returnDisplay: 'No reflection candidates.',
      };
    }

    const lines = candidates.map(
      (c, i) =>
        `${i + 1}. **${c.type}/${c.scope}**: ${c.text.slice(0, 120)}…\n   Reasoning: ${c.reasoning}`,
    );

    return {
      llmContent:
        `Detected ${candidates.length} potential learning(s):\n\n${lines.join('\n\n')}\n\n` +
        'Use `Memory_retain` to persist any of these.',
      returnDisplay: `${candidates.length} reflection candidates`,
    };
  }
}

export class MemoryReflectTool extends BaseDeclarativeTool<
  MemoryReflectParams,
  ToolResult
> {
  static readonly Name = 'Memory_reflect';

  constructor() {
    super(
      MemoryReflectTool.Name,
      'MemoryReflect',
      memoryReflectSchema.description!,
      Kind.Think,
      memoryReflectSchema.parametersJsonSchema as Record<string, unknown>,
      true, // isOutputMarkdown
      false, // canUpdateOutput
      true, // shouldDefer — reflect is infrequent, discoverable via ToolSearch
    );
  }

  protected createInvocation(
    params: MemoryReflectParams,
  ): ToolInvocation<MemoryReflectParams, ToolResult> {
    return new MemoryReflectInvocation(params);
  }
}
