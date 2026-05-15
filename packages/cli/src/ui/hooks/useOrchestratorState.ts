/**
 * @license
 * Copyright 2025 GLM
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type OrchestratorDecision =
  | 'INLINE'
  | 'DELEGATE'
  | 'FAN_OUT'
  | 'PIPELINE_PROMOTE';

export type TaskClassification = 'SMALL' | 'MEDIUM' | 'LARGE' | 'LONG_HORIZON';

export interface WorkerInfo {
  id: string;
  status: 'spawning' | 'running' | 'completing';
  model: string;
  task: string;
  elapsedSeconds: number;
}

export interface OrchestratorState {
  decision: OrchestratorDecision;
  pipelinePhase: string;
  pipelineStep: number;
  pipelineTotal: number;
  taskClassification: TaskClassification;
  workers: WorkerInfo[];
  contextPercent: number;
}

const DEFAULT_STATE: OrchestratorState = {
  decision: 'INLINE',
  pipelinePhase: 'idle',
  pipelineStep: 0,
  pipelineTotal: 0,
  taskClassification: 'SMALL',
  workers: [],
  contextPercent: 0,
};

const STATE_PATH = join(homedir(), '.glm', 'workflows', 'state.json');
const POLL_INTERVAL = 2000;

export function useOrchestratorState(): OrchestratorState {
  const [state, setState] = useState<OrchestratorState>(DEFAULT_STATE);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const readState = () => {
      try {
        if (!existsSync(STATE_PATH)) return;
        const raw = readFileSync(STATE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<OrchestratorState>;
        setState((prev) => ({
          ...prev,
          ...parsed,
        }));
      } catch {
        // File may be mid-write or missing; keep previous state
      }
    };

    readState();
    timer = setInterval(readState, POLL_INTERVAL);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  return state;
}
