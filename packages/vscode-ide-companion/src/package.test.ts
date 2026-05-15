/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package.json command metadata', () => {
  it('describes focusChat as focusing the chat view', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as {
      contributes: {
        commands: Array<{ command: string; title: string }>;
      };
    };

    const command = manifest.contributes.commands.find(
      (item) => item.command === 'glm-code.focusChat',
    );

    expect(command?.title).toBe('GLM Code: Focus Chat View');
  });
});
