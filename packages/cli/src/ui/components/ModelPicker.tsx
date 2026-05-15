/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interactive model picker TUI component.
 * Tab cycles through mode groups: ALL → CANONICAL → ZAI → back
 * Arrow keys navigate within a mode. Enter selects.
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text , useInput } from 'ink';
import type { Key } from 'ink';

/** Model entry displayed in the picker. */
export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  thinkingEffort?: string;
}

/** Filter mode for grouping models. */
export type PickerMode = 'ALL' | 'CANONICAL' | 'ZAI';

/** Props for the ModelPicker component. */
export interface ModelPickerProps {
  /** Available models. */
  models: ModelEntry[];
  /** Currently selected model ID. */
  currentModelId: string;
  /** Callback when a model is selected. */
  onSelect: (modelId: string) => void;
  /** Callback when picker is dismissed. */
  onDismiss: () => void;
}

/** All picker modes in tab cycle order. */
const PICKER_MODES: PickerMode[] = ['ALL', 'CANONICAL', 'ZAI'];

/**
 * Filter models by picker mode.
 */
function filterModels(models: ModelEntry[], mode: PickerMode): ModelEntry[] {
  switch (mode) {
    case 'CANONICAL':
      return models.filter(
        (m) => m.provider === 'glm' || m.provider === 'canonical',
      );
    case 'ZAI':
      return models.filter((m) => m.provider === 'zai');
    case 'ALL':
    default:
      return models;
  }
}

/**
 * Interactive model picker with tab cycling through mode groups.
 */
export function ModelPicker({
  models,
  currentModelId,
  onSelect,
  onDismiss,
}: ModelPickerProps): React.ReactElement {
  const [modeIndex, setModeIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const currentMode = PICKER_MODES[modeIndex];
  const filteredModels = filterModels(models, currentMode);

  const handleInput = useCallback(
    (_input: string, key: Key) => {
      if (key.tab) {
        // Cycle through modes
        const nextModeIndex = (modeIndex + 1) % PICKER_MODES.length;
        setModeIndex(nextModeIndex);
        setSelectedIndex(0);
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredModels.length - 1,
        );
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev < filteredModels.length - 1 ? prev + 1 : 0,
        );
        return;
      }

      if (key.return) {
        const selected = filteredModels[selectedIndex];
        if (selected) {
          onSelect(selected.id);
        }
        return;
      }

      if (key.escape) {
        onDismiss();
        return;
      }
    },
    [modeIndex, selectedIndex, filteredModels, onSelect, onDismiss],
  );

  useInput(handleInput);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Select Model</Text>
        <Text dimColor>
          {' '}
          (Tab: cycle mode | ↑↓: navigate | Enter: select | Esc: cancel)
        </Text>
      </Box>

      {/* Mode tabs */}
      <Box marginBottom={1}>
        {PICKER_MODES.map((mode, i) => (
          <Box key={mode} marginRight={2}>
            <Text
              color={i === modeIndex ? 'cyan' : undefined}
              bold={i === modeIndex}
            >
              {mode === currentMode ? `[${mode}]` : ` ${mode} `}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Model list */}
      <Box flexDirection="column">
        {filteredModels.map((model, i) => {
          const isCurrent = model.id === currentModelId;
          const isSelected = i === selectedIndex;
          const prefix = isSelected ? '›' : ' ';
          const suffix = isCurrent ? ' ← current' : '';
          const thinking = model.thinkingEffort
            ? ` [${model.thinkingEffort}]`
            : '';

          return (
            <Box key={model.id}>
              <Text
                color={isSelected ? 'green' : isCurrent ? 'yellow' : undefined}
                bold={isSelected}
              >
                {prefix} {model.name}
                {thinking}
                {suffix}
              </Text>
            </Box>
          );
        })}

        {filteredModels.length === 0 && (
          <Text dimColor>No models in this category</Text>
        )}
      </Box>
    </Box>
  );
}
