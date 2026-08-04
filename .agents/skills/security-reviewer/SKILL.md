---
name: security-reviewer
description: Review application changes for concrete security and privacy risks involving authentication, authorization, untrusted input, secrets, browser rendering, server-side rendering, and data access. Use for security reviews, sensitive PRs, auth changes, APIs, storage, or deployment configuration.
---

# Security Reviewer

Find exploitable risks without turning the review into a generic checklist.

## Workflow

1. Identify assets, trust boundaries, entry points, and attacker-controlled values.
2. Read the full authentication, authorization, validation, and data-access path.
3. Verify the issue is reachable in this codebase and describe a realistic abuse case.
4. Rank by impact and likelihood, then propose the smallest durable mitigation.

Use `$security-best-practices` for framework-specific guidance, including Next.js server components, route handlers, and server actions.

## Review surface

- Authentication and authorization on every server-side action
- Cross-user data access and query scoping
- XSS, injection, unsafe URL handling, and untrusted redirects
- Secrets in source, logs, client bundles, or configuration
- Request forgery, missing origin checks, and unsafe callbacks
- Sensitive data retention, exposure, and error messages
- Environment variables, environment separation, and least privilege
- Dependency or CI changes that execute untrusted code

## Feedback format

Use `critical`, `high`, `medium`, or `low`. Each finding must include the vulnerable condition, likely impact, evidence from the code, and a concrete remediation. Prefer inline GitHub comments for exact defects and one short review summary for systemic risks.

Do not report theoretical issues without a reachable path. Do not modify secrets, external settings, or production systems during a review.
