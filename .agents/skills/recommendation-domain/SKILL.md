---
name: recommendation-domain
description: Design and change how 같이볼래 selects content — context, mood, taste, runtime, format, provider, and avoid filters, plus two-person taste merging, ranking, result diversity, and empty-result handling. Use when adding or altering recommendation rules, scoring weights, filter semantics, result explanations, or the content data model that feeds them.
---

# Recommendation Domain

Own the question this product exists to answer: given who is watching, when, and under what constraints, which titles do we show and why. Implementation lives in the `recommendations` memo in `app/page.tsx`.

## Inputs

| Input | Values | Role |
| --- | --- | --- |
| mode | `solo`, `together` | Decides whether partner taste participates |
| context | `식사 중`, `자기 전`, `집중해서 보기`, `편하게 보기` | Strongest ranking signal; also seeds avoid defaults |
| mood | one of `MOODS` | Second ranking signal |
| taste | many of `TASTES`, per person | Genre affinity |
| duration | `30분 이내`, `60분 이내`, `120분 이상` | Hard filter |
| format | `상관없음`, `영화`, `시리즈`, `예능` | Hard filter |
| provider | one of `PROVIDERS` | Hard filter |
| avoids | many of `AVOIDS` | Hard filter, never relaxed |

## Invariants

Protect these before touching any weight.

1. **Hard filters stay hard.** Duration, format, provider, and avoids gate eligibility. Never demote one into a scoring term so that results appear — the UI promises `필수 조건은 추천할 때 절대 임의로 해제하지 않아요`.
2. **Avoids are a safety promise, not a preference.** A title carrying an excluded element must never surface, at any score, in any mode.
3. **Context-seeded avoids only add.** Selecting `식사 중` or `자기 전` adds defaults; the user must still be able to clear them, and re-picking a context must not resurrect what they cleared.
4. **`together` favors overlap, not the louder side.** Shared taste outweighs one-sided taste. A result set where every title matches only one person's genres is a defect even if the total score is high.
5. **Every result carries a reason.** Each card states why it was picked, derived from the actual inputs that scored it.
6. **Empty results keep constraints intact.** Offer to widen preferences; never silently drop a hard filter to fill the grid.

## Workflow

1. Read the current filter and scoring code end to end before proposing a change.
2. State the user-visible behavior you intend to change, as a scenario: inputs in, expected ordering out.
3. Check the change against every invariant above; if one bends, stop and surface the tradeoff instead of shipping it.
4. Adjust filters and weights separately — never in the same change — so regressions stay attributable.
5. Name the counter-case your change could break, and hand it to `$test-reviewer` as a unit-test scenario over the pure scoring function.

## Known gaps

Current state is a demo. Treat these as open work, not as precedent to copy.

- Match percentages on result cards are positional literals, not computed from score. Any real percentage must be derived, or the number must go.
- `refreshSeed` rotates the eligible list; it does not guarantee the next three differ meaningfully from the last three. Diversity is unimplemented.
- Reactions (`pick`, `skip`, `watched`) are captured but never fed back into ranking, and do not survive a reload.
- Content is a six-item literal array. Moving to TMDB introduces per-title availability that varies by region and expires — provider becomes time-sensitive data, not a static field.
- Avoid tags are hand-authored and mostly empty. Real catalog data has no equivalent field, so the exclusion rules need a defined source before they can be trusted.

## Out of scope

Component structure, styling, and funnel layout belong to the UI work and its skills. Route handlers, data access, and secrets belong to the server side. Bring findings there rather than editing those layers from this role.
