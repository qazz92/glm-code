/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import {
  getGlobalGLMDir,
  getRuntimeBaseDir,
  resetEnvBootstrapForTesting,
} from './paths.js';

/**
 * Each test gets a clean temp homedir (no `.env` files), so the lazy
 * `bootstrapHomeEnvOverrides()` becomes a no-op unless the test explicitly
 * writes `.env` content into the mocked home. ESM bans spying on `os.homedir`,
 * so we redirect via the underlying `HOME` / `USERPROFILE` env vars.
 */
function withCleanHome() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-paths-test-'));
  const realHome = fs.realpathSync(tempHome);
  const originalHomeEnv = process.env['HOME'];
  const originalUserProfile = process.env['USERPROFILE'];
  process.env['HOME'] = realHome;
  process.env['USERPROFILE'] = realHome;
  return {
    tempHome: realHome,
    cleanup: () => {
      if (originalHomeEnv !== undefined) {
        process.env['HOME'] = originalHomeEnv;
      } else {
        delete process.env['HOME'];
      }
      if (originalUserProfile !== undefined) {
        process.env['USERPROFILE'] = originalUserProfile;
      } else {
        delete process.env['USERPROFILE'];
      }
      fs.rmSync(realHome, { recursive: true, force: true });
    },
  };
}

describe('vscode-ide-companion paths – getGlobalGLMDir', () => {
  const originalEnv = process.env['GLM_HOME'];
  let home: ReturnType<typeof withCleanHome>;

  beforeEach(() => {
    resetEnvBootstrapForTesting();
    home = withCleanHome();
  });

  afterEach(() => {
    home.cleanup();
    if (originalEnv !== undefined) {
      process.env['GLM_HOME'] = originalEnv;
    } else {
      delete process.env['GLM_HOME'];
    }
  });

  it('defaults to ~/.glm when GLM_HOME is not set', () => {
    delete process.env['GLM_HOME'];
    expect(getGlobalGLMDir()).toBe(path.join(home.tempHome, '.glm'));
  });

  it('uses GLM_HOME when set to absolute path', () => {
    const configDir = path.resolve('/tmp/custom-glm');
    process.env['GLM_HOME'] = configDir;
    expect(getGlobalGLMDir()).toBe(configDir);
  });

  it('resolves relative GLM_HOME against process.cwd', () => {
    process.env['GLM_HOME'] = 'relative/config';
    expect(getGlobalGLMDir()).toBe(path.resolve('relative/config'));
  });

  it('expands tilde (~/x) in GLM_HOME', () => {
    process.env['GLM_HOME'] = '~/custom-glm';
    expect(getGlobalGLMDir()).toBe(path.join(home.tempHome, 'custom-glm'));
  });

  it('expands Windows-style tilde (~\\x) in GLM_HOME', () => {
    process.env['GLM_HOME'] = '~\\custom-glm';
    expect(getGlobalGLMDir()).toBe(path.join(home.tempHome, 'custom-glm'));
  });

  it('treats bare tilde (~) as home directory', () => {
    process.env['GLM_HOME'] = '~';
    expect(getGlobalGLMDir()).toBe(home.tempHome);
  });
});

describe('vscode-ide-companion paths – getRuntimeBaseDir', () => {
  const originalHome = process.env['GLM_HOME'];
  const originalRuntime = process.env['GLM_RUNTIME_DIR'];
  let home: ReturnType<typeof withCleanHome>;

  beforeEach(() => {
    resetEnvBootstrapForTesting();
    home = withCleanHome();
  });

  afterEach(() => {
    home.cleanup();
    if (originalHome !== undefined) {
      process.env['GLM_HOME'] = originalHome;
    } else {
      delete process.env['GLM_HOME'];
    }
    if (originalRuntime !== undefined) {
      process.env['GLM_RUNTIME_DIR'] = originalRuntime;
    } else {
      delete process.env['GLM_RUNTIME_DIR'];
    }
  });

  it('falls back to getGlobalGLMDir() when neither env var is set', () => {
    delete process.env['GLM_HOME'];
    delete process.env['GLM_RUNTIME_DIR'];
    expect(getRuntimeBaseDir()).toBe(getGlobalGLMDir());
  });

  it('uses GLM_RUNTIME_DIR when set to absolute path', () => {
    delete process.env['GLM_HOME'];
    const runtimeDir = path.resolve('/tmp/custom-runtime');
    process.env['GLM_RUNTIME_DIR'] = runtimeDir;
    expect(getRuntimeBaseDir()).toBe(runtimeDir);
  });

  it('resolves relative GLM_RUNTIME_DIR against process.cwd', () => {
    delete process.env['GLM_HOME'];
    process.env['GLM_RUNTIME_DIR'] = 'relative/runtime';
    expect(getRuntimeBaseDir()).toBe(path.resolve('relative/runtime'));
  });

  it('expands tilde (~/x) in GLM_RUNTIME_DIR', () => {
    delete process.env['GLM_HOME'];
    process.env['GLM_RUNTIME_DIR'] = '~/custom-runtime';
    expect(getRuntimeBaseDir()).toBe(
      path.join(home.tempHome, 'custom-runtime'),
    );
  });

  it('falls back to GLM_HOME when GLM_RUNTIME_DIR is unset', () => {
    delete process.env['GLM_RUNTIME_DIR'];
    const configDir = path.resolve('/tmp/custom-glm');
    process.env['GLM_HOME'] = configDir;
    expect(getRuntimeBaseDir()).toBe(configDir);
  });

  it('GLM_RUNTIME_DIR takes priority over GLM_HOME', () => {
    const configDir = path.resolve('/tmp/custom-glm');
    const runtimeDir = path.resolve('/tmp/custom-runtime');
    process.env['GLM_HOME'] = configDir;
    process.env['GLM_RUNTIME_DIR'] = runtimeDir;
    expect(getRuntimeBaseDir()).toBe(runtimeDir);
  });
});

describe('vscode-ide-companion paths – .env bootstrap', () => {
  const originalHome = process.env['GLM_HOME'];
  const originalRuntime = process.env['GLM_RUNTIME_DIR'];
  let home: ReturnType<typeof withCleanHome>;

  beforeEach(() => {
    resetEnvBootstrapForTesting();
    home = withCleanHome();
    delete process.env['GLM_HOME'];
    delete process.env['GLM_RUNTIME_DIR'];
  });

  afterEach(() => {
    home.cleanup();
    if (originalHome !== undefined) {
      process.env['GLM_HOME'] = originalHome;
    } else {
      delete process.env['GLM_HOME'];
    }
    if (originalRuntime !== undefined) {
      process.env['GLM_RUNTIME_DIR'] = originalRuntime;
    } else {
      delete process.env['GLM_RUNTIME_DIR'];
    }
  });

  it('reads GLM_HOME from <homedir>/.glm/.env', () => {
    const configDir = path.resolve('/tmp/from-glm-dotenv');
    fs.mkdirSync(path.join(home.tempHome, '.glm'), { recursive: true });
    fs.writeFileSync(
      path.join(home.tempHome, '.glm', '.env'),
      `GLM_HOME=${configDir}\n`,
    );
    expect(getGlobalGLMDir()).toBe(configDir);
    expect(process.env['GLM_HOME']).toBe(configDir);
  });

  it('reads GLM_HOME from <homedir>/.env when ~/.glm/.env is absent', () => {
    const configDir = path.resolve('/tmp/from-home-dotenv');
    fs.writeFileSync(
      path.join(home.tempHome, '.env'),
      `GLM_HOME=${configDir}\n`,
    );
    expect(getGlobalGLMDir()).toBe(configDir);
    expect(process.env['GLM_HOME']).toBe(configDir);
  });

  it('process env wins over .env file', () => {
    const envDir = path.resolve('/tmp/from-process-env');
    const dotenvDir = path.resolve('/tmp/from-dotenv');
    process.env['GLM_HOME'] = envDir;
    fs.mkdirSync(path.join(home.tempHome, '.glm'), { recursive: true });
    fs.writeFileSync(
      path.join(home.tempHome, '.glm', '.env'),
      `GLM_HOME=${dotenvDir}\n`,
    );
    expect(getGlobalGLMDir()).toBe(envDir);
  });

  it('reads GLM_RUNTIME_DIR from <GLM_HOME>/.env when GLM_HOME is preset', () => {
    const configDir = path.join(home.tempHome, 'custom-glm');
    const runtimeDir = path.resolve('/tmp/from-runtime-dotenv');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, '.env'),
      `GLM_RUNTIME_DIR=${runtimeDir}\n`,
    );
    process.env['GLM_HOME'] = configDir;
    expect(getRuntimeBaseDir()).toBe(runtimeDir);
  });

  it('does not read <homedir>/.env when GLM_HOME is preset', () => {
    const configDir = path.resolve('/tmp/preset-glm-home');
    process.env['GLM_HOME'] = configDir;
    fs.writeFileSync(
      path.join(home.tempHome, '.env'),
      `GLM_RUNTIME_DIR=/tmp/should-be-ignored\n`,
    );
    expect(getRuntimeBaseDir()).toBe(configDir);
    expect(process.env['GLM_RUNTIME_DIR']).toBeUndefined();
  });

  it('reads GLM_RUNTIME_DIR from <new GLM_HOME>/.env after discovery via ~/.glm/.env', () => {
    const configDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'glm-bootstrap-cfg-')),
    );
    const runtimeDir = path.resolve('/tmp/from-discovered-runtime');
    fs.mkdirSync(path.join(home.tempHome, '.glm'), { recursive: true });
    fs.writeFileSync(
      path.join(home.tempHome, '.glm', '.env'),
      `GLM_HOME=${configDir}\n`,
    );
    fs.writeFileSync(
      path.join(configDir, '.env'),
      `GLM_RUNTIME_DIR=${runtimeDir}\n`,
    );
    try {
      expect(getRuntimeBaseDir()).toBe(runtimeDir);
      expect(process.env['GLM_HOME']).toBe(configDir);
      expect(process.env['GLM_RUNTIME_DIR']).toBe(runtimeDir);
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });
});
