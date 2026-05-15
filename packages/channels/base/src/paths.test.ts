import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { getGlobalGLMDir, resolvePath } from './paths.js';

describe('channels/base paths – getGlobalGLMDir', () => {
  const originalEnv = process.env['GLM_HOME'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['GLM_HOME'] = originalEnv;
    } else {
      delete process.env['GLM_HOME'];
    }
  });

  it('defaults to ~/.glm when GLM_HOME is not set', () => {
    delete process.env['GLM_HOME'];
    expect(getGlobalGLMDir()).toBe(path.join(os.homedir(), '.glm'));
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
    expect(getGlobalGLMDir()).toBe(path.join(os.homedir(), 'custom-glm'));
  });

  it('expands Windows-style tilde (~\\x) in GLM_HOME', () => {
    process.env['GLM_HOME'] = '~\\custom-glm';
    expect(getGlobalGLMDir()).toBe(path.join(os.homedir(), 'custom-glm'));
  });

  it('treats bare tilde (~) as home directory', () => {
    process.env['GLM_HOME'] = '~';
    expect(getGlobalGLMDir()).toBe(os.homedir());
  });
});

describe('channels/base paths – resolvePath', () => {
  it('returns absolute paths unchanged', () => {
    const abs = path.resolve('/tmp/x');
    expect(resolvePath(abs)).toBe(abs);
  });

  it('expands bare tilde (~) to home directory', () => {
    expect(resolvePath('~')).toBe(os.homedir());
  });

  it('expands POSIX-style tilde (~/x)', () => {
    expect(resolvePath('~/xomo')).toBe(path.join(os.homedir(), 'xomo'));
  });

  it('expands Windows-style tilde (~\\x)', () => {
    expect(resolvePath('~\\xomo')).toBe(path.join(os.homedir(), 'xomo'));
  });

  it('resolves relative paths against process.cwd', () => {
    expect(resolvePath('relative/dir')).toBe(path.resolve('relative/dir'));
  });
});
