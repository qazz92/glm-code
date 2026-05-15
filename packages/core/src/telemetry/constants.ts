/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'glm-code';

export const EVENT_USER_PROMPT = 'glm-code.user_prompt';
export const EVENT_USER_RETRY = 'glm-code.user_retry';
export const EVENT_TOOL_CALL = 'glm-code.tool_call';
export const EVENT_API_REQUEST = 'glm-code.api_request';
export const EVENT_API_ERROR = 'glm-code.api_error';
export const EVENT_API_CANCEL = 'glm-code.api_cancel';
export const EVENT_API_RESPONSE = 'glm-code.api_response';
export const EVENT_CLI_CONFIG = 'glm-code.config';
export const EVENT_EXTENSION_DISABLE = 'glm-code.extension_disable';
export const EVENT_EXTENSION_ENABLE = 'glm-code.extension_enable';
export const EVENT_EXTENSION_INSTALL = 'glm-code.extension_install';
export const EVENT_EXTENSION_UNINSTALL = 'glm-code.extension_uninstall';
export const EVENT_EXTENSION_UPDATE = 'glm-code.extension_update';
export const EVENT_FLASH_FALLBACK = 'glm-code.flash_fallback';
export const EVENT_RIPGREP_FALLBACK = 'glm-code.ripgrep_fallback';
export const EVENT_NEXT_SPEAKER_CHECK = 'glm-code.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'glm-code.slash_command';
export const EVENT_IDE_CONNECTION = 'glm-code.ide_connection';
export const EVENT_CHAT_COMPRESSION = 'glm-code.chat_compression';
export const EVENT_INVALID_CHUNK = 'glm-code.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'glm-code.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE =
  'glm-code.chat.content_retry_failure';
export const EVENT_CONVERSATION_FINISHED = 'glm-code.conversation_finished';
export const EVENT_MALFORMED_JSON_RESPONSE =
  'glm-code.malformed_json_response';
export const EVENT_FILE_OPERATION = 'glm-code.file_operation';
export const EVENT_MODEL_SLASH_COMMAND = 'glm-code.slash_command.model';
export const EVENT_SUBAGENT_EXECUTION = 'glm-code.subagent_execution';
export const EVENT_SKILL_LAUNCH = 'glm-code.skill_launch';
export const EVENT_AUTH = 'glm-code.auth';
export const EVENT_USER_FEEDBACK = 'glm-code.user_feedback';

// Prompt Suggestion Events
export const EVENT_PROMPT_SUGGESTION = 'glm-code.prompt_suggestion';
export const EVENT_SPECULATION = 'glm-code.speculation';

// Arena Events
export const EVENT_ARENA_SESSION_STARTED = 'glm-code.arena_session_started';
export const EVENT_ARENA_AGENT_COMPLETED = 'glm-code.arena_agent_completed';
export const EVENT_ARENA_SESSION_ENDED = 'glm-code.arena_session_ended';

// Performance Events
export const EVENT_STARTUP_PERFORMANCE = 'glm-code.startup.performance';
export const EVENT_MEMORY_USAGE = 'glm-code.memory.usage';
export const EVENT_PERFORMANCE_BASELINE = 'glm-code.performance.baseline';
export const EVENT_PERFORMANCE_REGRESSION = 'glm-code.performance.regression';

// Managed Auto-Memory Events
export const EVENT_MEMORY_EXTRACT = 'glm-code.memory.extract';
export const EVENT_MEMORY_DREAM = 'glm-code.memory.dream';
export const EVENT_MEMORY_RECALL = 'glm-code.memory.recall';

// Session Tracing Span Names
export const SPAN_INTERACTION = 'glm-code.interaction';
export const SPAN_LLM_REQUEST = 'glm-code.llm_request';
export const SPAN_TOOL = 'glm-code.tool';
export const SPAN_TOOL_EXECUTION = 'glm-code.tool.execution';
