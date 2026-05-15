/**
 * Shared Memory tool — cross-agent KV store at ~/.glm/shared/<namespace>/.
 *
 * Each key is stored as a JSON file with optional TTL.
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

const debugLogger = createDebugLogger('SHARED_MEMORY_TOOL');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHARED_DIR = 'shared';
const DEFAULT_NAMESPACE = 'default';

interface SharedEntry {
  value: string;
  expiresAt?: number; // epoch ms
}

function getSharedDir(namespace: string): string {
  return path.join(Storage.getGlobalGLMDir(), SHARED_DIR, namespace);
}

function getSharedFilePath(namespace: string, key: string): string {
  return path.join(getSharedDir(namespace), `${key}.json`);
}

function isExpired(entry: SharedEntry): boolean {
  return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
}

// ---------------------------------------------------------------------------
// Params & schema
// ---------------------------------------------------------------------------

export interface SharedMemoryParams {
  action: 'read' | 'write' | 'delete' | 'list';
  key: string;
  value?: string;
  namespace?: string;
  ttl?: number; // seconds
}

const sharedMemorySchema: FunctionDeclaration = {
  name: 'SharedMemory',
  description:
    'Cross-agent key-value store. Each key is a JSON file under ~/.glm/shared/<namespace>/. ' +
    'Supports optional TTL for automatic expiry. Used for inter-agent coordination.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'delete', 'list'],
        description: 'Operation to perform.',
      },
      key: {
        type: 'string',
        description:
          'Key name (alphanumeric, hyphens, underscores, dots). Ignored for list action.',
      },
      value: {
        type: 'string',
        description: 'Value to write (JSON-serializable string).',
      },
      namespace: {
        type: 'string',
        description: 'Namespace for grouping keys. Defaults to "default".',
      },
      ttl: {
        type: 'number',
        description: 'Time-to-live in seconds. After this, the entry expires.',
      },
    },
    required: ['action', 'key'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

class SharedMemoryInvocation extends BaseToolInvocation<
  SharedMemoryParams,
  ToolResult
> {
  getDescription(): string {
    return `SharedMemory ${this.params.action}: ${this.params.key}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { action, key, value, namespace = DEFAULT_NAMESPACE, ttl } = this.params;

    try {
      if (action === 'read') {
        const filePath = getSharedFilePath(namespace, key);
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          const entry: SharedEntry = JSON.parse(raw);
          if (isExpired(entry)) {
            await fs.unlink(filePath).catch(() => {});
            return {
              llmContent: `Key "${key}" has expired.`,
              returnDisplay: 'Expired.',
            };
          }
          return {
            llmContent: entry.value,
            returnDisplay: entry.value,
          };
        } catch (err) {
          const e = err as Error & { code?: string };
          if (e.code === 'ENOENT') {
            return {
              llmContent: `Key "${key}" not found in namespace "${namespace}".`,
              returnDisplay: 'Not found.',
            };
          }
          throw err;
        }
      }

      if (action === 'write') {
        if (value === undefined) {
          return {
            llmContent: 'Value is required for write action.',
            returnDisplay: 'Error: missing value.',
          };
        }
        const dir = getSharedDir(namespace);
        await fs.mkdir(dir, { recursive: true });
        const entry: SharedEntry = { value };
        if (ttl && ttl > 0) {
          entry.expiresAt = Date.now() + ttl * 1000;
        }
        const filePath = getSharedFilePath(namespace, key);
        await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
        debugLogger.debug(`Wrote key "${key}" in namespace "${namespace}"`);
        return {
          llmContent: `Key "${key}" written to namespace "${namespace}".${ttl ? ` TTL: ${ttl}s` : ''}`,
          returnDisplay: `Wrote ${key}`,
        };
      }

      if (action === 'delete') {
        const filePath = getSharedFilePath(namespace, key);
        try {
          await fs.unlink(filePath);
          debugLogger.debug(`Deleted key "${key}" from namespace "${namespace}"`);
          return {
            llmContent: `Key "${key}" deleted from namespace "${namespace}".`,
            returnDisplay: `Deleted ${key}`,
          };
        } catch (err) {
          const e = err as Error & { code?: string };
          if (e.code === 'ENOENT') {
            return {
              llmContent: `Key "${key}" not found in namespace "${namespace}".`,
              returnDisplay: 'Not found.',
            };
          }
          throw err;
        }
      }

      if (action === 'list') {
        const dir = getSharedDir(namespace);
        let files: string[];
        try {
          files = await fs.readdir(dir);
        } catch (err) {
          const e = err as Error & { code?: string };
          if (e.code === 'ENOENT') {
            return {
              llmContent: `Namespace "${namespace}" is empty.`,
              returnDisplay: 'Empty namespace.',
            };
          }
          throw err;
        }
        const keys: string[] = [];
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const k = file.slice(0, -'.json'.length);
          // Check expiry
          try {
            const raw = await fs.readFile(path.join(dir, file), 'utf-8');
            const entry: SharedEntry = JSON.parse(raw);
            if (isExpired(entry)) {
              await fs.unlink(path.join(dir, file)).catch(() => {});
            } else {
              keys.push(k);
            }
          } catch {
            keys.push(k);
          }
        }
        return {
          llmContent:
            keys.length > 0
              ? `Keys in namespace "${namespace}":\n${keys.map((k) => `  - ${k}`).join('\n')}`
              : `Namespace "${namespace}" is empty.`,
          returnDisplay: `${keys.length} keys`,
        };
      }

      return {
        llmContent: `Unknown action: ${action}`,
        returnDisplay: `Unknown action: ${action}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`SharedMemory action failed: ${msg}`);
      return {
        llmContent: `SharedMemory operation failed: ${msg}`,
        returnDisplay: `Error: ${msg}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class SharedMemoryTool extends BaseDeclarativeTool<
  SharedMemoryParams,
  ToolResult
> {
  static readonly Name = 'SharedMemory';

  constructor() {
    super(
      SharedMemoryTool.Name,
      'SharedMemory',
      sharedMemorySchema.description!,
      Kind.Think,
      sharedMemorySchema.parametersJsonSchema as Record<string, unknown>,
      true, // isOutputMarkdown
      false, // canUpdateOutput
      true, // shouldDefer — shared memory is infrequent
    );
  }

  protected createInvocation(
    params: SharedMemoryParams,
  ): ToolInvocation<SharedMemoryParams, ToolResult> {
    return new SharedMemoryInvocation(params);
  }
}
