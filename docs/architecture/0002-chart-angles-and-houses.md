# ADR 0002: Ascendant, Midheaven, and Whole Sign Houses

- **Status:** Accepted for the chart-engine core; not yet wired to any API route or stored birth data
- **Date:** 2026-08-10
- **Scope:** Backend astronomical facts only — closes part of ADR-0001's "Deferred" section

## Context

ADR-0001 deliberately returned `null` for houses and the Ascendant rather than invent unvalidated numbers. Personalized content (Faz 0.2 of the product plan) needs a real Ascendant and house placements, computed from a geographic birth location that the product does not yet collect or store. This ADR covers only the calculation itself; birth-data collection, encrypted storage, and API wiring are separate, later work.

Ascendant and Midheaven calculations are unusually easy to get subtly wrong: a single sign error in an obliquity or hour-angle term produces a plausible-looking but incorrect zodiac sign, and — unlike a raw planetary longitude — there is no NASA/JPL Horizons endpoint that publishes Ascendant/MC directly to check against.

## Decision

1. Compute the Ascendant and Midheaven **without any hand-derived trigonometric formula**. Instead, build both from `astronomy-engine`'s own documented, paired primitives — `VectorFromSphere`, `Rotation_ECT_EQD`, `EquatorFromVector`, `Horizon`, `SiderealTime` — reusing the library's own tested obliquity, precession, and nutation handling rather than re-deriving it. `ECT` (true ecliptic of date) is used throughout, matching the frame ADR-0001's planetary positions already use; the library's `ECL` family is a *different*, J2000-mean-ecliptic frame and was deliberately avoided to keep angles consistent with existing planetary longitudes.
2. Find the Ascendant/Descendant by sampling the ecliptic's altitude above the local horizon (via `Horizon`) on a 0.5° grid, bisecting each sign change to full double precision, and disambiguating the rising point (Ascendant) from the setting point (Descendant) by checking that its altitude is higher one minute later — the literal physical definition of "rising," not a formula guess.
3. Find the Midheaven/Imum Coeli the same way, searching for where the ecliptic's right ascension equals local sidereal time (hour angle zero). This calculation never uses observer latitude, which is itself a built-in correctness signal: real Midheaven is latitude-independent, and a test asserts that this implementation is too.
4. Implement **Whole Sign houses only**. House 1 is the entire zodiac sign containing the Ascendant; each subsequent house is the next sign. This is the simplest, oldest house system and requires no latitude-dependent iteration.
5. Explicitly throw, rather than guess, when the ecliptic does not cross the local horizon exactly twice (a genuine degeneracy near the poles) or the local meridian exactly once (an internal-consistency check that should be mathematically impossible to fail and indicates a bug if it ever does).

## Validation

No external Ascendant/MC reference fixture exists to copy the way ADR-0001 copied JPL Horizons data. Validation instead relies on properties provable from first principles, each checked directly:

- **Exact special cases**, constructed so the expected answer is derivable independently of this module's own code: when local sidereal time is set (by choosing observer longitude) so the vernal equinox point (0° Aries, RA=0°, Dec=0°) sits exactly on the horizon and rising, the calculated Ascendant must be 0° Aries; when local sidereal time is 0°, the same point sits exactly on the local meridian, so the calculated Midheaven must be 0° Aries.
- **Geometric invariants** that must hold for any input: Descendant = Ascendant + 180° and Imum Coeli = Midheaven + 180° exactly (two points where a great circle crosses another great circle are always antipodal); Midheaven is identical across different observer latitudes at the same longitude and time; the calculated Ascendant's altitude is within numerical noise of zero and strictly higher one minute later.
- **Whole Sign house structure**: cusps are exactly 30° apart, house 1 starts at the Ascendant's sign boundary (not its exact degree), and wraps correctly from Pisces back to Aries.

This process caught two real defects during implementation, both in the zero-crossing search rather than the astronomy: a periodic function's wrap boundary (e.g. +179° to -179°) was initially mistaken for a genuine sign-change root, and a sample landing exactly on zero was double-counted across the two brackets it borders. Both are fixed in `findZeroCrossings` (`backend/src/chart-engine/houses.ts`) and covered by the special-case tests above, which failed clearly until both were corrected.

## Consequences

### Positive

- The Ascendant, Midheaven, and Whole Sign houses can now be computed to the same numerical rigor ADR-0001 established for planetary positions, without introducing a second, inconsistent ecliptic frame.
- The validation method (exact special cases + geometric invariants) is reusable for any future angle/house calculation and does not depend on finding or trusting a secondhand external reference value.

### Deferred

- **Placidus houses.** The product plan calls for Placidus as the mainstream-expectation house system alongside Whole Sign. Placidus requires iterative numerical solving of the diurnal/nocturnal semi-arc trisection and has its own polar-latitude degeneracies; it needs its own dedicated implementation and validation pass, not an extension of this ADR.
- **Lunar nodes, Chiron, and additional points** — still not calculated.
- **Birth-time-unknown handling for angles.** `personalGuidance.ts` already treats natal Moon and time-sensitive transit aspects as degraded when `time_certainty !== 'exact'`; the Ascendant/Midheaven/houses added here are *always* time-sensitive (a few minutes of birth time shifts the Ascendant by about a degree) and calling code must not surface them at all for `approximate` or `unknown` birth times. This ADR does not yet wire that gating in — no caller reaches this module yet.
- **Everything needed to actually reach a real user**: birth location collection in onboarding, encrypted storage (`user_birth_data` table), timezone/observer resolution from a city dataset, and exposing any of this through `NatalChartV1` or an API route. `createNatalChart` in `natalChart.ts` still returns `ascendant: null, houses: null` — this ADR adds the capability to compute them but does not yet call it from anywhere.

## Primary references

- Astronomy Engine rotation-matrix family documentation (`Rotation_ECT_EQD`, `Rotation_ECL_EQD`, `Horizon`, `EquatorFromVector`, `VectorFromSphere`): `node_modules/astronomy-engine/astronomy.d.ts`, source https://github.com/cosinekitty/astronomy
- ADR-0001: `docs/architecture/0001-chart-engine-ephemeris.md`
