# Plan Review

> Review implementation plans before coding with `/plan-review`.

`/plan-review` is a native orchestration route: it tells GLM Code's
orchestrator to fan out review work to isolated specialist subagents instead of
loading the whole review workflow as an ordinary skill in the main context. It
is designed for `PLAN.md`, design docs, roadmaps, specs, and implementation
proposals that should be checked before work starts.

## Quick start

```bash
# Review PLAN.md or another discovered plan file
/plan-review

# Review a specific plan
/plan-review PLAN.md
/plan-review .glm/design/my-feature.md

# Force every lens
/plan-review PLAN.md --all

# Run only selected lenses
/plan-review PLAN.md --technical --ux
/plan-review .glm/design/strategy.md --product
```

## How it works

The command runs a review-only native orchestration flow:

1. Resolves the plan path. If you do not pass a path, GLM Code looks for common
   plan locations such as `PLAN.md`, `DESIGN.md`, `.glm/design/*.md`, and
   `docs/plans/*.md`.
2. Injects a plan-review orchestration instruction into the turn.
3. Resolves the plan with minimal main-context inspection and decides which
   review lenses are relevant.
4. Launches the selected specialist agents in parallel.
5. Deduplicates their feedback into one final plan review.

## Review lenses

| Lens      | Built-in agent            | Focus                                                                 |
| --------- | ------------------------- | --------------------------------------------------------------------- |
| Product   | `product-plan-reviewer`   | user value, scope, rollout, compatibility, adoption, success criteria |
| UX        | `ux-plan-reviewer`        | user journey, commands, output, prompts, errors, accessibility, docs  |
| Technical | `technical-plan-reviewer` | architecture, sequencing, migrations, tests, rollback, performance    |

By default, GLM Code chooses the matching lenses automatically. If the plan is a
user-facing product feature, it will usually run all three. If the plan is purely
internal maintenance, it may run only the technical lens. Use `--all` when you
want every lens regardless of the automatic routing decision.

## Output

The final report includes:

- a verdict: `APPROVE`, `REQUEST_CHANGES`, or `NEEDS_CLARIFICATION`
- which lenses ran or were skipped
- blocking issues
- important improvements
- cross-lens conflicts
- recommended plan revisions
- acceptance criteria fixes

`/plan-review` does not edit the plan by default. Apply the recommended changes
manually or ask GLM Code for a separate rewrite after reviewing the feedback.
