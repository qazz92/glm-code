/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('imageSupport browser bundling', () => {
  it('does not leave core runtime imports in the webview bundle', async () => {
    const result = await esbuild.build({
      entryPoints: [
        fileURLToPath(new URL('./imageSupport.ts', import.meta.url)),
      ],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
      external: ['@glm-code/core'],
    });

    const output = result.outputFiles[0]?.text ?? '';

    expect(output).not.toContain('@glm-code/core');
    expect(output).not.toContain('supportedImageFormats.js');
  });

  it('does not leave core runtime imports in the App webview bundle', async () => {
    const result = await esbuild.build({
      entryPoints: [
        fileURLToPath(new URL('../webview/App.tsx', import.meta.url)),
      ],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
      external: ['@glm-code/core'],
      loader: {
        '.png': 'dataurl',
      },
    });

    const output = result.outputFiles[0]?.text ?? '';

    expect(output).not.toContain('@glm-code/core');
    expect(output).not.toContain('tokenLimits.js');
  });
});
