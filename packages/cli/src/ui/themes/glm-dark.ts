/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const glmDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0b0e14',
  Foreground: '#bfbdb6',
  LightBlue: '#59C2FF',
  AccentBlue: '#39BAE6',
  AccentPurple: '#D2A6FF',
  AccentCyan: '#95E6CB',
  AccentGreen: '#AAD94C',
  AccentYellow: '#FFD700',
  AccentRed: '#F26D78',
  AccentYellowDim: '#8B7530',
  AccentRedDim: '#8B3A4A',
  DiffAdded: '#AAD94C',
  DiffRemoved: '#F26D78',
  Comment: '#646A71',
  Gray: '#3D4149',
  GradientColors: ['#FFD700', '#da7959'],
};

export const GLMDark: Theme = new Theme(
  'GLM Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: glmDarkColors.Background,
      color: glmDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: glmDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: glmDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: glmDarkColors.LightBlue,
    },
    'hljs-link': {
      color: glmDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: glmDarkColors.Foreground,
    },
    'hljs-string': {
      color: glmDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: glmDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: glmDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: glmDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: glmDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: glmDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: glmDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: glmDarkColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  glmDarkColors,
  darkSemanticColors,
);
