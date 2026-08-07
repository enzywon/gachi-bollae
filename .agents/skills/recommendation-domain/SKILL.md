---
name: recommendation-domain
description: Design and change how 같이볼래 selects content — context, mood, taste, runtime, format, provider, and avoid filters, plus two-person taste merging, ranking, result diversity, and empty-result handling. Use when adding or altering recommendation rules, scoring weights, filter semantics, result explanations, or the content data model that feeds them.
---

# Recommendation Domain

Own the question this product exists to answer: given who is watching, when, and under what constraints, which titles do we show and why. Implementation is the `recommendations` memo in `app/page.tsx`; the option lists and the demo catalog are in `app/_data/contents.ts`.

## Inputs

| Input | Values | Role |
| --- | --- | --- |
| mode | `solo`, `together` | Decides whether partner taste participates |
| context | `식사 중`, `자기 전`, `집중해서 보기`, `편하게 보기` | Strongest ranking signal |
| mood | one of `MOODS` | Second ranking signal |
| taste | many of `TASTES`, per person | Genre affinity |
| duration | `30분 이내`, `60분 이내`, `120분 이상` | Hard filter |
| format | `상관없음`, `영화`, `시리즈`, `예능` | Hard filter |
| provider | one of `PROVIDERS` | Hard filter |
| avoids | many of `AVOIDS` | Hard filter, never relaxed |

Eligibility is `runtime ≤ max AND format match AND provider match AND no avoided tag`. Ranking over the survivors is context `+35`, mood `+25`, own taste `×9` per match, and in `together` mode `min(mine, partner) × 8 + partner × 4`. The top three of the sorted list are shown.

## Invariants

Protect these before touching any weight.

1. **Hard filters stay hard.** Duration, format, provider, and avoids gate eligibility. Never demote one into a scoring term so that results appear — the UI promises `필수 조건은 그대로 지켰어요`.
2. **Avoids are a safety promise, not a preference.** A title carrying an excluded element must never surface, at any score, in any mode.
3. **Context-seeded avoids only add.** `setContextWithDefaults` adds exclusions when `식사 중` or `자기 전` is picked. They are defaults, not policy — the user must still be able to clear them.
4. **`together` favors overlap, not the louder side.** Shared taste outweighs one-sided taste — that is what `min(mine, partner) × 8` buys over the flat `partner × 4`. A result set where every title matches only one person's genres is a defect even if the total score is high.
5. **Every result carries a reason.** Each card states why it was picked, derived from the actual inputs that scored it.
6. **Empty results keep constraints intact.** Offer to widen preferences; never silently drop a hard filter to fill the grid.
7. **Recommending never needs the database.** `/` must render and recommend with no `DATABASE_URL` set — persistence is attached at the rating step, not before it. Ranking that reads from storage has to keep a working no-storage path.

## Workflow

1. Read the filter and scoring code end to end before proposing a change.
2. State the user-visible behavior you intend to change, as a scenario: inputs in, expected ordering out.
3. Check the change against every invariant above; if one bends, stop and surface the tradeoff instead of shipping it.
4. Adjust filters and weights separately — never in the same change — so regressions stay attributable.
5. Name the counter-case your change could break, and hand it to `$test-reviewer` as a unit-test scenario over the pure scoring function.

## Known gaps

Current state is a demo. Treat these as open work, not as precedent to copy.

- **Two scoring terms are dead weight.** `runtime ≤ maxRuntime` (`+15`) and the provider match (`+10`) are already required for eligibility, so both are constant across every scored item and change no ordering. Removing them or making them soft preferences are different products — decide which before touching the weights around them.
- **"거절한 콘텐츠를 제외하고 다시 찾아볼게요" is not implemented.** The refresh button clears `reactions` and advances `refreshSeed` by 3, which rotates the eligible list; skipped titles are never excluded and can come straight back. With a six-item catalog they usually do. The copy promises a behavior the code does not have.
- **Re-picking a context resurrects cleared avoids.** `setContextWithDefaults` re-adds its defaults on every selection, so a user who clears `잔인함·고어` and then taps `식사 중` again gets it back with no notice. Seeding should happen once per context choice, not once per tap.
- **Match percentages are positional literals.** `88 - index * 3` in together mode, `92 - index * 3` in solo. They are unrelated to the score. Any real percentage must be derived, or the number must go.
- **Diversity is unimplemented.** `refreshSeed` rotation does not guarantee the next three differ meaningfully from the last three.
- **Reactions never reach ranking.** `pick` and `skip` live in component state and do not survive a reload. `watched` now leads to a rating sheet that writes a `watch_records` row with `watchMode`, `pickedContext`, and `pickedMood` snapshotted alongside the rating — so the feedback data exists, it is simply not read back. Closing that loop is the first real ranking work available, and it crosses into `$data-platform`.
- **Content is a six-item literal array** in `app/_data/contents.ts`. Moving to TMDB introduces per-title availability that varies by region and expires — provider becomes time-sensitive data, not a static field.
- **Avoid tags are hand-authored and mostly empty.** Real catalog data has no equivalent field, so the exclusion rules need a defined source before they can be trusted.

## Out of scope

Component structure, styling, and funnel layout belong to the UI work and its skills. Tables, migrations, owner-key access rules, and route handlers belong to `$data-platform`. Bring findings there rather than editing those layers from this role.
