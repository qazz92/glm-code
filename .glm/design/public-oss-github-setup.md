# Public Open Source GitHub Setup

## Goal

Prepare `qazz92/glm-code` for public open source collaboration by adding common
community health files, dependency/security automation, CI, and repository rules
that protect `main` without blocking maintainers from bootstrapping the initial
setup.

## Decisions

- Use Apache-2.0 as the declared package license to match the existing LICENSE.
- Enable GitHub Discussions for support and disable blank issues so support,
  bugs, feature requests, and security reports go through the right channels.
- Use a single default CODEOWNER (`@qazz92`) and require one approval on `main`.
- Enable linear history and disable merge commits at the repository level.
- Add CI and CodeQL workflows, starting with repository metadata checks and
  `packages/core` build coverage so the initial public workflow can stay green.
  Full monorepo build gating should wait until existing workspace build issues are
  cleaned up.
- Use weekly Dependabot updates grouped by ecosystem to avoid PR noise.

## Follow-up

After the workflow exists on `main`, update branch protection to require the
`Repository hygiene` and `Core build` checks. Add full monorepo build/typecheck
gating after the existing workspace build issues are resolved.
