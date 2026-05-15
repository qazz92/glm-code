/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { installCommand } from './extensions/install.js';
import { uninstallCommand } from './extensions/uninstall.js';
import { listCommand } from './extensions/list.js';
import { updateCommand } from './extensions/update.js';
import { disableCommand } from './extensions/disable.js';
import { enableCommand } from './extensions/enable.js';
import { linkCommand } from './extensions/link.js';
import { newCommand } from './extensions/new.js';
import { settingsCommand } from './extensions/settings.js';

/**
 * `glm plugin` — an alias for `glm extensions`.
 * Registers the same subcommands (install, uninstall, update, enable, disable, etc.)
 * under the `plugin` top-level command for ergonomic convenience.
 */
export const pluginCommand: CommandModule = {
  command: 'plugin <command>',
  describe: 'Manage GLM Code plugins (alias for extensions).',
  builder: (yargs) =>
    yargs
      .command(installCommand)
      .command(uninstallCommand)
      .command(listCommand)
      .command(updateCommand)
      .command(disableCommand)
      .command(enableCommand)
      .command(linkCommand)
      .command(newCommand)
      .command(settingsCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
