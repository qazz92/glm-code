/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * File-relative AGENTS.md discovery.
 * When reading a deep file, walks up to find the nearest AGENTS.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const AGENTS_FILENAMES = ['AGENTS.md', 'GLM.md', 'CLAUDE.md'];

/**
 * Walk up from filePath to find the nearest AGENTS.md (or equivalent).
 * Returns the path to the file, or null if none found.
 */
export function findNearestAgentsMd(
  filePath: string,
  stopAt?: string,
): string | null {
  let dir = path.dirname(path.resolve(filePath));
  const stop = stopAt ? path.resolve(stopAt) : path.parse(dir).root;

  while (dir !== stop && dir !== path.dirname(dir)) {
    for (const filename of AGENTS_FILENAMES) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    dir = path.dirname(dir);
  }

  return null;
}
