/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { getUserSettingsDir, getUserSettingsPath } from './settings.js';
import { getTrustedFoldersPath } from './trustedFolders.js';

// Regression guard: `GLM_HOME` is resolved by `preResolveHomeEnvOverrides()`
// AFTER any module that imports a settings/trustedFolders path has loaded.
// A top-level `const` would freeze the pre-bootstrap value and split state
// across callers. Each test mutates `process.env.GLM_HOME` post-load and
// asserts the exported path getters reflect the new value.

describe('settings/trustedFolders path getters are lazy', () => {
  let originalGLMHome: string | undefined;
  let originalTrustedPath: string | undefined;

  beforeEach(() => {
    originalGLMHome = process.env['GLM_HOME'];
    originalTrustedPath = process.env['GLM_CODE_TRUSTED_FOLDERS_PATH'];
    delete process.env['GLM_HOME'];
    delete process.env['GLM_CODE_TRUSTED_FOLDERS_PATH'];
  });

  afterEach(() => {
    if (originalGLMHome === undefined) delete process.env['GLM_HOME'];
    else process.env['GLM_HOME'] = originalGLMHome;
    if (originalTrustedPath === undefined)
      delete process.env['GLM_CODE_TRUSTED_FOLDERS_PATH'];
    else process.env['GLM_CODE_TRUSTED_FOLDERS_PATH'] = originalTrustedPath;
  });

  it('getUserSettingsPath() reflects GLM_HOME set after module load', () => {
    const defaultPath = getUserSettingsPath();
    expect(defaultPath).toBe(path.join(homedir(), '.glm', 'settings.json'));

    process.env['GLM_HOME'] = '/tmp/glm-lazy-test';
    expect(getUserSettingsPath()).toBe(
      path.join('/tmp/glm-lazy-test', 'settings.json'),
    );
  });

  it('getUserSettingsDir() reflects GLM_HOME set after module load', () => {
    expect(getUserSettingsDir()).toBe(path.join(homedir(), '.glm'));

    process.env['GLM_HOME'] = '/tmp/glm-lazy-test';
    expect(getUserSettingsDir()).toBe(path.normalize('/tmp/glm-lazy-test'));
  });

  it('getTrustedFoldersPath() reflects GLM_HOME set after module load', () => {
    expect(getTrustedFoldersPath()).toBe(
      path.join(homedir(), '.glm', 'trustedFolders.json'),
    );

    process.env['GLM_HOME'] = '/tmp/glm-lazy-test';
    expect(getTrustedFoldersPath()).toBe(
      path.join('/tmp/glm-lazy-test', 'trustedFolders.json'),
    );
  });
});
