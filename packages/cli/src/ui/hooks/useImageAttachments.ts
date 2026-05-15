/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { useCallback } from 'react';
import { createDebugLogger } from '@glm-code/core';

const debugLogger = createDebugLogger('IMAGE_ATTACHMENTS');

/** Supported image file extensions. */
export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.heic',
]);

/**
 * Check whether a file path points to a supported image type.
 */
export function isImageFilePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Format a byte count as a human-readable file size string.
 * e.g. 234000 → "234KB", 1500000 → "1.5MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export interface ImageAttachment {
  id: string;
  path: string;
  filename: string;
  sizeInBytes: number;
}

/**
 * Hook providing utilities for managing image file attachments.
 * Handles copying image files into the session attachment directory
 * and creating attachment descriptors with size metadata.
 */
export function useImageAttachments() {
  /**
   * Save an image file from an arbitrary path into the session attachments
   * directory. Returns an ImageAttachment descriptor, or null if the file
   * is not a valid image.
   */
  const attachImageFile = useCallback(
    async (
      filePath: string,
      sessionDir: string,
    ): Promise<ImageAttachment | null> => {
      try {
        const resolvedPath = path.resolve(filePath);

        if (!isImageFilePath(resolvedPath)) {
          return null;
        }

        const stat = await fs.stat(resolvedPath);
        if (!stat.isFile()) {
          return null;
        }

        const attachmentsDir = path.join(sessionDir, 'attachments');
        await fs.mkdir(attachmentsDir, { recursive: true });

        const filename = path.basename(resolvedPath);
        const destPath = path.join(attachmentsDir, filename);

        // Avoid clobbering: append timestamp suffix if needed
        let finalDestPath = destPath;
        try {
          await fs.access(destPath);
          // File exists — generate unique name
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          const timestamp = Date.now();
          finalDestPath = path.join(attachmentsDir, `${base}-${timestamp}${ext}`);
        } catch {
          // File does not exist — destPath is fine
        }

        await fs.copyFile(resolvedPath, finalDestPath);

        return {
          id: String(Date.now()),
          path: finalDestPath,
          filename: path.basename(finalDestPath),
          sizeInBytes: stat.size,
        };
      } catch (error) {
        debugLogger.error('Error attaching image file:', error);
        return null;
      }
    },
    [],
  );

  /**
   * Create an attachment descriptor for an already-saved image file
   * (e.g., one saved from the clipboard). Reads the file size from disk.
   */
  const createAttachmentFromPath = useCallback(
    async (imagePath: string): Promise<ImageAttachment | null> => {
      try {
        const stat = await fs.stat(imagePath);
        return {
          id: String(Date.now()),
          path: imagePath,
          filename: path.basename(imagePath),
          sizeInBytes: stat.size,
        };
      } catch (error) {
        debugLogger.error('Error creating attachment from path:', error);
        return null;
      }
    },
    [],
  );

  return { attachImageFile, createAttachmentFromPath };
}
