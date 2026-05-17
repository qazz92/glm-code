/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixtureRoot = resolve(
  import.meta.dirname,
  '../fixtures/glm-code-testbed',
);

describe('glm-code-testbed fixture', () => {
  it('is a copyable project with passing baseline checks', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'glm-code-testbed-'));
    const projectRoot = join(tempRoot, 'project');

    try {
      cpSync(fixtureRoot, projectRoot, { recursive: true });

      const manifest = JSON.parse(
        readFileSync(
          join(projectRoot, 'scenarios/expected-outcomes.json'),
          'utf8',
        ),
      ) as { baselineCommand: string; expectedTools: string[] };

      expect(manifest.baselineCommand).toBe('npm run check');
      expect(manifest.expectedTools).toContain('read_file');
      expect(manifest.expectedTools).toContain('testbed_echo');
      expect(existsSync(join(projectRoot, '.glm/settings.json'))).toBe(true);
      expect(existsSync(join(projectRoot, '.glmignore'))).toBe(true);

      const output = execFileSync('npm', ['run', 'check', '--silent'], {
        cwd: projectRoot,
        encoding: 'utf8',
      });

      expect(output).toContain('check ok');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
