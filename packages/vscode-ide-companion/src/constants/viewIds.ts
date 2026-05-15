/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebviewView IDs for the chat UI host positions.
 * These IDs must match the `views` contributions declared in package.json.
 *
 * Only one of sidebar / secondary is visible at runtime — controlled by the
 * `glm-code:supportsSecondarySidebar` context key in package.json.
 * The secondary sidebar is preferred; the primary sidebar is a fallback for
 * VS Code versions that lack secondary sidebar support.
 */
export const CHAT_VIEW_ID_SIDEBAR = 'glm-code.chatView.sidebar';
export const CHAT_VIEW_ID_SECONDARY = 'glm-code.chatView.secondary';
