---
name: test-reviewer
description: Review changed behavior and test coverage, identify missing regression cases, and design focused unit, integration, or browser tests. Use when reviewing a PR, planning validation, diagnosing CI coverage gaps, or adding tests for React, server-rendered, and user-facing flows.
---

# Test Reviewer

Map the changed behavior to the smallest reliable set of tests.

## Workflow

1. Read the diff, acceptance intent, current tests, and CI commands.
2. List observable behavior that changed, including failure and boundary paths.
3. Match each risk to the lowest stable test level.
4. Flag missing coverage only when it could catch a plausible regression.
5. When implementation is requested, add focused tests and run the narrowest relevant command first.

## Test selection

- Use unit tests for pure scoring, filtering, and transformation logic.
- Use integration tests for route handlers, server rendering, and data access.
- Use `$playwright` for critical browser flows, accessibility behavior, and cross-component interactions.
- Avoid testing implementation details, arbitrary timing, or unstable selectors.
- Keep fixtures isolated and tests deterministic and parallel-safe.

## Feedback format

For each gap, state the behavior at risk, the failure the test should detect, the recommended test level, and a concise scenario. Distinguish required regression coverage from optional hardening.

Do not demand coverage percentages without context. Do not duplicate checks already guaranteed by types, lint, or a lower-cost deterministic test.
