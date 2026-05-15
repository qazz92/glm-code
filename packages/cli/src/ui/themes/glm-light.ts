/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

const glmLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f8f9fa',
  Foreground: '#5c6166',
  LightBlue: '#55b4d4',
  AccentBlue: '#399ee6',
  AccentPurple: '#a37acc',
  AccentCyan: '#4cbf99',
  AccentGreen: '#86b300',
  AccentYellow: '#f2ae49',
  AccentRed: '#f07171',
  AccentYellowDim: '#8B7000',
  AccentRedDim: '#993333',
  DiffAdded: '#86b300',
  DiffRemoved: '#f07171',
  Comment: '#ABADB1',
  Gray: '#CCCFD3',
  GradientColors: ['#399ee6', '#86b300'],
};

export const GLMLight: Theme = new Theme(
  'GLM Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: glmLightColors.Background,
      color: glmLightColors.Foreground,
    },
    'hljs-comment': {
      color: glmLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: glmLightColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: glmLightColors.AccentGreen,
    },
    'hljs-constant': {
      color: glmLightColors.AccentCyan,
    },
    'hljs-number': {
      color: glmLightColors.AccentPurple,
    },
    'hljs-keyword': {
      color: glmLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: glmLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: glmLightColors.AccentYellow,
    },
    'hljs-variable': {
      color: glmLightColors.Foreground,
    },
    'hljs-variable.language': {
      color: glmLightColors.LightBlue,
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: glmLightColors.AccentBlue,
    },
    'hljs-section': {
      color: glmLightColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: glmLightColors.LightBlue,
    },
    'hljs-class .hljs-title': {
      color: glmLightColors.AccentBlue,
    },
    'hljs-tag': {
      color: glmLightColors.LightBlue,
    },
    'hljs-name': {
      color: glmLightColors.AccentBlue,
    },
    'hljs-builtin-name': {
      color: glmLightColors.AccentYellow,
    },
    'hljs-meta': {
      color: glmLightColors.AccentYellow,
    },
    'hljs-symbol': {
      color: glmLightColors.AccentRed,
    },
    'hljs-bullet': {
      color: glmLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: glmLightColors.AccentCyan,
    },
    'hljs-link': {
      color: glmLightColors.LightBlue,
    },
    'hljs-deletion': {
      color: glmLightColors.AccentRed,
    },
    'hljs-addition': {
      color: glmLightColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: glmLightColors.AccentCyan,
    },
    'hljs-built_in': {
      color: glmLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: glmLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: glmLightColors.AccentCyan,
    },
    'hljs-selector-id': {
      color: glmLightColors.AccentRed,
    },
  },
  glmLightColors,
  lightSemanticColors,
);
