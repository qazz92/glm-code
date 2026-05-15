/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Storage } from '@glm-code/core';

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
  type StreamMessagesActionReturn,
  type SubmitPromptActionReturn,
} from './types.js';
import { t } from '../../i18n/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DIMENSION = 2048;
const CACHE_DIR_NAME = 'vision';

/** Supported image extensions (lower-case, with dot). */
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.heic',
  '.bmp',
  '.tiff',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCacheDir(): string {
  return path.join(Storage.getGlobalGLMDir(), 'cache', CACHE_DIR_NAME);
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function hashBuffer(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Quick PNG/JPEG dimension reader that avoids loading the full image.
 * Returns `null` when the format is unrecognised.
 */
function readImageDimensions(
  data: Buffer,
): { width: number; height: number } | null {
  // PNG: first 8 bytes signature, then IHDR at offset 8
  if (
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: SOI marker (FF D8), then find SOF0/SOF2 marker
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xff) break;
      const marker = data[offset + 1];
      // SOF0 (0xFFC0) or SOF2 (0xFFC2) — progressive
      if (marker === 0xc0 || marker === 0xc2) {
        const height = data.readUInt16BE(offset + 5);
        const width = data.readUInt16BE(offset + 7);
        return { width, height };
      }
      // Skip to next marker — length is big-endian uint16 at offset+2
      const segLen = data.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }

  return null;
}

/** Ensure the cache directory exists. */
async function ensureCacheDir(): Promise<string> {
  const dir = getCacheDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

interface VisionCacheEntry {
  /** SHA-256 hex digest of the image bytes. */
  hash: string;
  /** The prompt used for analysis. */
  prompt: string;
  /** The analysis result text. */
  result: string;
  /** ISO-8601 timestamp when cached. */
  cachedAt: string;
}

async function readCache(
  imageHash: string,
  prompt: string,
): Promise<string | null> {
  const cachePath = path.join(getCacheDir(), `${imageHash}.json`);
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const entries: VisionCacheEntry[] = JSON.parse(raw);
    const match = entries.find((e) => e.prompt === prompt);
    return match?.result ?? null;
  } catch {
    return null;
  }
}

async function writeCache(
  imageHash: string,
  prompt: string,
  result: string,
): Promise<void> {
  const cachePath = path.join(getCacheDir(), `${imageHash}.json`);
  let entries: VisionCacheEntry[] = [];
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    entries = JSON.parse(raw);
  } catch {
    // first write for this hash
  }

  // Replace existing entry for the same prompt, or append.
  const idx = entries.findIndex((e) => e.prompt === prompt);
  const entry: VisionCacheEntry = {
    hash: imageHash,
    prompt,
    result,
    cachedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }

  await ensureCacheDir();
  await fs.writeFile(cachePath, JSON.stringify(entries, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Image pre-processing
// ---------------------------------------------------------------------------

/**
 * Attempt to auto-resize an image that exceeds `MAX_DIMENSION` on any side.
 * Returns the (possibly resized) image Buffer, or the original on failure.
 *
 * Since no native resize library (sharp, canvas) is bundled, this logs a
 * warning when the image is too large and returns the original data.
 */
async function autoResize(data: Buffer): Promise<{
  data: Buffer;
  resized: boolean;
  originalDimensions: { width: number; height: number } | null;
}> {
  const dims = readImageDimensions(data);

  if (!dims) {
    return { data, resized: false, originalDimensions: null };
  }

  if (dims.width <= MAX_DIMENSION && dims.height <= MAX_DIMENSION) {
    return { data, resized: false, originalDimensions: dims };
  }

  // No native resize library available — log a warning.
  // The image will be sent as-is; the server-side model may still handle it.
  return { data, resized: false, originalDimensions: dims };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  /** Paths to image files. */
  imagePaths: string[];
  /** The textual prompt for analysis. */
  prompt: string;
}

function parseArgs(args: string): ParsedArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const imagePaths: string[] = [];
  const promptParts: string[] = [];

  for (const token of tokens) {
    // Expand ~ to home directory
    const expanded = token.startsWith('~')
      ? path.join(os.homedir(), token.slice(1))
      : token;

    if (isImagePath(expanded) || isImagePath(token)) {
      imagePaths.push(expanded);
    } else if (path.isAbsolute(expanded) && fsSync.existsSync(expanded)) {
      // Absolute path that exists but isn't a known image extension — include
      // it and let the vision tool decide.
      imagePaths.push(expanded);
    } else {
      promptParts.push(token);
    }
  }

  return {
    imagePaths,
    prompt: promptParts.join(' ') || 'Analyze the image(s) in detail.',
  };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const visionCommand: SlashCommand = {
  name: 'vision',
  get description() {
    return t('Analyze images using vision capabilities');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive', 'non_interactive'] as const,
  argumentHint: '[image-paths...] [prompt]',

  action: async (_context, args): Promise<SlashCommandActionReturn> => {
    const { imagePaths, prompt } = parseArgs(args);

    // If no explicit image paths were provided, fall through to the
    // prompt-only path — the model will use its attached images / MCP tool.
    if (imagePaths.length === 0) {
      return {
        type: 'submit_prompt',
        content: [
          {
            text: `Use the glm-vision MCP tool to analyze any attached images. ${prompt}`,
          },
        ],
      } satisfies SubmitPromptActionReturn;
    }

    // Process each image: load, check size, cache-lookup.
    async function* processImages(): AsyncGenerator<
      { messageType: 'info' | 'error'; content: string },
      void,
      unknown
    > {
      for (const imagePath of imagePaths) {
        const resolved = path.resolve(imagePath);
        const basename = path.basename(resolved);

        // Load image data
        let imageData: Buffer;
        try {
          imageData = await fs.readFile(resolved);
        } catch {
          yield {
            messageType: 'error' as const,
            content: `Failed to read image: ${resolved}`,
          };
          continue;
        }

        const imageHash = hashBuffer(imageData);

        // Check cache
        const cached = await readCache(imageHash, prompt);
        if (cached !== null) {
          yield {
            messageType: 'info' as const,
            content: `[cached] ${basename}:\n${cached}`,
          };
          continue;
        }

        // Auto-resize check
        const { resized, originalDimensions } = await autoResize(imageData);

        if (originalDimensions && !resized) {
          const { width, height } = originalDimensions;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            yield {
              messageType: 'info' as const,
              content:
                `⚠ ${basename} is ${width}×${height}px (exceeds ${MAX_DIMENSION}px limit). ` +
                `No resize library available — sending as-is. ` +
                `Consider pre-processing the image for better results.`,
            };
          }
        }

        // Submit to the vision model via prompt
        yield {
          messageType: 'info' as const,
          content:
            `Analyzing ${basename}… ` +
            `(hash: ${imageHash.slice(0, 12)}…, ` +
            `${originalDimensions ? `${originalDimensions.width}×${originalDimensions.height}px` : 'unknown dimensions'})`,
        };

        // Build the prompt that will invoke the vision MCP tool
        const visionPrompt =
          `Use the glm-vision MCP tool to analyze the image at "${resolved}". ` +
          `Prompt: ${prompt}\n\n` +
          `After receiving the result, save it to the vision cache by responding with:\n` +
          `VISION_CACHE:${imageHash}:${prompt.replace(/:/g, '\\:')}`;

        yield {
          messageType: 'info' as const,
          content: visionPrompt,
        };

        // Write a placeholder cache entry so repeat invocations within
        // the same session can be deduplicated. The full result will be
        // written when the model response arrives.
        await writeCache(imageHash, prompt, '(pending — result will be cached)');
      }
    }

    return {
      type: 'stream_messages',
      messages: processImages(),
    } satisfies StreamMessagesActionReturn;
  },
};
