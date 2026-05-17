/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Orchestrator } from './orchestrator.js';
import {
  PLAN_REVIEW_ORCHESTRATION_MARKER,
  buildPlanReviewOrchestrationInstruction,
  isPlanReviewRequest,
} from './plan-review.js';

describe('plan-review orchestration', () => {
  it('detects explicit native plan-review prompts', () => {
    expect(
      isPlanReviewRequest(`${PLAN_REVIEW_ORCHESTRATION_MARKER}\nPLAN.md`),
    ).toBe(true);
  });

  it('detects natural-language plan review requests', () => {
    expect(isPlanReviewRequest('PLAN.md 를 보고 리뷰 해줄래?')).toBe(true);
    expect(isPlanReviewRequest('Please critique the design doc')).toBe(true);
  });

  it('does not detect unrelated implementation prompts', () => {
    expect(isPlanReviewRequest('Implement the PLAN.md changes now')).toBe(
      false,
    );
    expect(isPlanReviewRequest('Fix the failing tests')).toBe(false);
  });

  it('builds a mandatory agent fan-out instruction', () => {
    const instruction = buildPlanReviewOrchestrationInstruction();

    expect(instruction).toContain(PLAN_REVIEW_ORCHESTRATION_MARKER);
    expect(instruction).toContain('product-plan-reviewer');
    expect(instruction).toContain('ux-plan-reviewer');
    expect(instruction).toContain('technical-plan-reviewer');
    expect(instruction).toContain('MUST be Agent tool calls');
    expect(instruction).toContain('Do not use the Skill tool');
  });

  it('injects specialized fan-out without generic executor subtasks', () => {
    const orchestrator = new Orchestrator();
    const result = orchestrator.orchestrate(
      `${PLAN_REVIEW_ORCHESTRATION_MARKER}\nReview PLAN.md --all`,
      {
        model: 'glm-5',
        turnCount: 1,
        sessionId: 'test-session',
        projectRoot: '/repo',
      },
    );

    expect(result.systemInstruction).toContain(
      PLAN_REVIEW_ORCHESTRATION_MARKER,
    );
    expect(result.systemInstruction).toContain('product-plan-reviewer');
    expect(result.systemInstruction).toContain('ux-plan-reviewer');
    expect(result.systemInstruction).toContain('technical-plan-reviewer');
    expect(result.systemInstruction).not.toContain('subtask-1');
    expect(result.fanout).toBeUndefined();
    expect(result.pipeline).toBeUndefined();
  });
});
