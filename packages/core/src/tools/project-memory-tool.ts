/**
 * Project Memory tool — read/write <project>/.glm/project-memory.json.
 *
 * Sections: techStack, build, conventions, structure, notes, directives.
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

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('PROJECT_MEMORY_TOOL');

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export interface ProjectMemoryData {
  techStack: string[];
  build: string;
  conventions: string[];
  structure: string;
  notes: Array<{ category: string; content: string }>;
  directives: Array<{ directive: string; priority: string }>;
}

function emptyProjectMemory(): ProjectMemoryData {
  return {
    techStack: [],
    build: '',
    conventions: [],
    structure: '',
    notes: [],
    directives: [],
  };
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function getProjectMemoryPath(projectRoot: string): string {
  return path.join(projectRoot, '.glm', 'project-memory.json');
}

async function readProjectMemory(
  projectRoot: string,
): Promise<ProjectMemoryData> {
  try {
    const content = await fs.readFile(
      getProjectMemoryPath(projectRoot),
      'utf-8',
    );
    return { ...emptyProjectMemory(), ...JSON.parse(content) };
  } catch {
    return emptyProjectMemory();
  }
}

async function writeProjectMemory(
  projectRoot: string,
  data: ProjectMemoryData,
): Promise<void> {
  const filePath = getProjectMemoryPath(projectRoot);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Params & schema
// ---------------------------------------------------------------------------

export interface ProjectMemoryParams {
  action: 'read' | 'write' | 'addNote' | 'addDirective';
  section?: string;
  content?: string;
  category?: string;
  directive?: string;
  priority?: string;
}

const projectMemorySchema: FunctionDeclaration = {
  name: 'ProjectMemory',
  description:
    'Read or write project-level memory (.glm/project-memory.json). ' +
    'Stores tech stack, build info, conventions, structure, notes, and directives.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'addNote', 'addDirective'],
        description: 'Operation to perform.',
      },
      section: {
        type: 'string',
        description:
          'Section to read/write (techStack, build, conventions, structure, notes, directives).',
      },
      content: {
        type: 'string',
        description: 'Content for write operations.',
      },
      category: {
        type: 'string',
        description: 'Category for addNote action.',
      },
      directive: {
        type: 'string',
        description: 'Directive text for addDirective action.',
      },
      priority: {
        type: 'string',
        description: 'Priority for directive (normal or high).',
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

class ProjectMemoryInvocation extends BaseToolInvocation<
  ProjectMemoryParams,
  ToolResult
> {
  constructor(
    params: ProjectMemoryParams,
    private readonly projectRoot: string,
  ) {
    super(params);
  }

  getDescription(): string {
    return `ProjectMemory ${this.params.action}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { action, section, content, category, directive, priority } =
      this.params;

    try {
      const data = await readProjectMemory(this.projectRoot);

      if (action === 'read') {
        if (section) {
          const value = data[section as keyof ProjectMemoryData];
          if (value === undefined) {
            return {
              llmContent: `Unknown section: "${section}". Available: techStack, build, conventions, structure, notes, directives.`,
              returnDisplay: `Unknown section: ${section}`,
            };
          }
          return {
            llmContent: JSON.stringify(value, null, 2),
            returnDisplay: `Read ${section}`,
          };
        }
        return {
          llmContent: JSON.stringify(data, null, 2),
          returnDisplay: 'Full project memory loaded.',
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
        const key = section as keyof ProjectMemoryData;
        try {
          data[key] = JSON.parse(content) as never;
        } catch {
          (data as unknown as Record<string, unknown>)[key] = content;
        }
        await writeProjectMemory(this.projectRoot, data);
        debugLogger.debug(`Wrote section "${section}"`);
        return {
          llmContent: `Section "${section}" updated.`,
          returnDisplay: `Wrote ${section}`,
        };
      }

      if (action === 'addNote') {
        if (!category || !content) {
          return {
            llmContent:
              'Both category and content are required for addNote.',
            returnDisplay: 'Error: missing category/content.',
          };
        }
        data.notes.push({ category, content });
        await writeProjectMemory(this.projectRoot, data);
        debugLogger.debug(`Added note to category "${category}"`);
        return {
          llmContent: `Note added to category "${category}".`,
          returnDisplay: `Added note`,
        };
      }

      if (action === 'addDirective') {
        if (!directive) {
          return {
            llmContent: 'Directive is required for addDirective.',
            returnDisplay: 'Error: missing directive.',
          };
        }
        data.directives.push({
          directive,
          priority: priority ?? 'normal',
        });
        await writeProjectMemory(this.projectRoot, data);
        debugLogger.debug(`Added directive: ${directive}`);
        return {
          llmContent: `Directive added: "${directive}"`,
          returnDisplay: 'Directive added.',
        };
      }

      return {
        llmContent: `Unknown action: ${action}`,
        returnDisplay: `Unknown action: ${action}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`ProjectMemory action failed: ${msg}`);
      return {
        llmContent: `ProjectMemory operation failed: ${msg}`,
        returnDisplay: `Error: ${msg}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class ProjectMemoryTool extends BaseDeclarativeTool<
  ProjectMemoryParams,
  ToolResult
> {
  static readonly Name = 'ProjectMemory';

  constructor(private readonly projectRoot: string) {
    super(
      ProjectMemoryTool.Name,
      'ProjectMemory',
      projectMemorySchema.description!,
      Kind.Think,
      projectMemorySchema.parametersJsonSchema as Record<string, unknown>,
      true, // isOutputMarkdown
      false, // canUpdateOutput
      true, // shouldDefer — project memory is infrequent
    );
  }

  protected createInvocation(
    params: ProjectMemoryParams,
  ): ToolInvocation<ProjectMemoryParams, ToolResult> {
    return new ProjectMemoryInvocation(params, this.projectRoot);
  }
}
