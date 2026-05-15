/**
 * Notepad tool — read/write/append to ~/.glm/notepad.md.
 *
 * Sections: priority, working, manual.
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

const debugLogger = createDebugLogger('NOTEPAD_TOOL');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTEPAD_FILENAME = 'notepad.md';

function getNotepadPath(): string {
  return path.join(Storage.getGlobalGLMDir(), NOTEPAD_FILENAME);
}

const SECTION_HEADERS: Record<string, string> = {
  priority: '## Priority',
  working: '## Working Memory',
  manual: '## Manual',
};

const SECTION_ORDER = ['priority', 'working', 'manual'] as const;

function buildNotepadContent(
  sections: Record<string, string>,
): string {
  const parts: string[] = ['# Notepad', ''];
  for (const key of SECTION_ORDER) {
    parts.push(SECTION_HEADERS[key]);
    parts.push('');
    const content = sections[key]?.trim();
    if (content) {
      parts.push(content);
    } else {
      parts.push('(empty)');
    }
    parts.push('');
  }
  return parts.join('\n');
}

function parseSections(
  content: string,
): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const key of SECTION_ORDER) {
    const header = SECTION_HEADERS[key];
    const start = content.indexOf(header);
    if (start === -1) {
      sections[key] = '';
      continue;
    }
    const bodyStart = start + header.length;
    let end = content.length;
    for (const otherKey of SECTION_ORDER) {
      if (otherKey === key) continue;
      const otherHeader = SECTION_HEADERS[otherKey];
      const otherStart = content.indexOf(otherHeader, bodyStart);
      if (otherStart !== -1 && otherStart < end) {
        end = otherStart;
      }
    }
    sections[key] = content.slice(bodyStart, end).trim();
  }
  return sections;
}

async function readSections(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(getNotepadPath(), 'utf-8');
    return parseSections(content);
  } catch {
    // File doesn't exist yet — return empty sections
    return { priority: '', working: '', manual: '' };
  }
}

async function writeSections(
  sections: Record<string, string>,
): Promise<void> {
  const content = buildNotepadContent(sections);
  const dir = path.dirname(getNotepadPath());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getNotepadPath(), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Params & schema
// ---------------------------------------------------------------------------

export interface NotepadParams {
  action: 'read' | 'write' | 'append';
  section?: 'priority' | 'working' | 'manual';
  content?: string;
}

const notepadSchema: FunctionDeclaration = {
  name: 'Notepad',
  description:
    'Read, write, or append to a persistent notepad file (~/.glm/notepad.md). ' +
    'The notepad has three sections: priority (always loaded), working (auto-pruned), and manual (never pruned).',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'append'],
        description: 'The operation to perform.',
      },
      section: {
        type: 'string',
        enum: ['priority', 'working', 'manual'],
        description:
          'Target section. For read, omit to get all sections.',
      },
      content: {
        type: 'string',
        description: 'Content for write/append actions.',
      },
    },
    required: ['action'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

class NotepadInvocation extends BaseToolInvocation<NotepadParams, ToolResult> {
  getDescription(): string {
    return `Notepad ${this.params.action}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { action, section, content } = this.params;

    try {
      if (action === 'read') {
        const sections = await readSections();
        if (section) {
          const s = sections[section] ?? '(empty)';
          return {
            llmContent: `## ${section}\n\n${s}`,
            returnDisplay: s,
          };
        }
        const all = Object.entries(sections)
          .map(([k, v]) => `${SECTION_HEADERS[k]}\n\n${v || '(empty)'}`)
          .join('\n\n');
        return {
          llmContent: all,
          returnDisplay: 'Full notepad loaded.',
        };
      }

      if (action === 'write') {
        if (!section) {
          return {
            llmContent: 'Section is required for write action.',
            returnDisplay: 'Error: missing section.',
          };
        }
        if (content === undefined) {
          return {
            llmContent: 'Content is required for write action.',
            returnDisplay: 'Error: missing content.',
          };
        }
        const sections = await readSections();
        sections[section] = content;
        await writeSections(sections);
        debugLogger.debug(`Wrote section "${section}"`);
        return {
          llmContent: `Section "${section}" updated.`,
          returnDisplay: `Wrote to ${section}`,
        };
      }

      if (action === 'append') {
        if (!content) {
          return {
            llmContent: 'Content is required for append action.',
            returnDisplay: 'Error: missing content.',
          };
        }
        const targetSection = section ?? 'working';
        const sections = await readSections();
        const existing = sections[targetSection] ?? '';
        sections[targetSection] = existing
          ? `${existing}\n${content}`
          : content;
        await writeSections(sections);
        debugLogger.debug(`Appended to section "${targetSection}"`);
        return {
          llmContent: `Appended to section "${targetSection}".`,
          returnDisplay: `Appended to ${targetSection}`,
        };
      }

      return {
        llmContent: `Unknown action: ${action}`,
        returnDisplay: `Unknown action: ${action}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`Notepad action failed: ${msg}`);
      return {
        llmContent: `Notepad operation failed: ${msg}`,
        returnDisplay: `Error: ${msg}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class NotepadTool extends BaseDeclarativeTool<
  NotepadParams,
  ToolResult
> {
  static readonly Name = 'Notepad';

  constructor() {
    super(
      NotepadTool.Name,
      'Notepad',
      notepadSchema.description!,
      Kind.Think,
      notepadSchema.parametersJsonSchema as Record<string, unknown>,
      true, // isOutputMarkdown
      false, // canUpdateOutput
      true, // shouldDefer — notepad is infrequent
    );
  }

  protected createInvocation(
    params: NotepadParams,
  ): ToolInvocation<NotepadParams, ToolResult> {
    return new NotepadInvocation(params);
  }
}
