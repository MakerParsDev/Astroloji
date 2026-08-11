# ADR 0003: Vedic/Sidereal Calculation Line

- **Status:** Accepted for the chart-engine core; not yet wired to any API route, LLM prompt family, or Android UI
- **Date:** 2026-08-11
- **Scope:** Backend astronomical facts only — a parallel calculation line alongside the tropical engine from ADR-0001/0002, not a replacement for it

## Context

The product plan's Faz 3.2 calls for a Hindi/Vedic content line. This is explicitly **not a translation** of the existing tropical chart: Vedic astrology uses the sidereal zodiac, where zero degrees is fixed relative to the star field rather than to the (precessing) vernal equinox. A tropically-correct chart is considered wrong by a Vedic audience. The gap between the two zodiacs — the ayanamsa — is currently about 24°, so sign placements frequently differ outright, not just in degree.

Two further Vedic-specific facts have no tropical equivalent at all and are required for any credible Vedic reading:

- **Nakshatra** (one of 27 lunar mansions, ~13°20′ each) — the primary unit Vedic astrology reasons in, more granular than sign.
- **Vimshottari dasha** — a deterministic 120-year sequence of planetary "ruling periods," derived entirely from the Moon's sidereal position at birth, that Vedic astrology uses for timing predictions. There is no tropical analog.

Swiss Ephemeris — the library most Vedic software uses for its built-in Lahiri ayanamsa mode — remains rejected for the reasons ADR-0001 already recorded (AGPL/commercial dual license). `astronomy-engine` has no ayanamsa or sidereal-zodiac concept at all; this ADR has to derive one without a hand-rolled precession formula, matching the discipline ADR-0002 established for the Ascendant.

## Decision

1. **Ayanamsa: True Chitrapaksha, derived from the library's own fixed-star support, not a polynomial formula.** `astronomy-engine` exposes `DefineStar` + `GeoVector` + `Ecliptic` for arbitrary fixed stars, applying the same tested precession/nutation/aberration machinery already used for planets (ADR-0001) and the Ascendant (ADR-0002). The True Chitrapaksha ayanamsa is *defined* as the value that places the star Spica (Chitra) at exactly 180° sidereal longitude (0° Libra) at all times. Concretely: register Spica via `DefineStar` using its J2000 catalog coordinates (RA 13h25m11.58s, Dec −11°09′41″, distance 250 ly — parallax is negligible at stellar distance and does not materially affect the result), compute its apparent tropical ecliptic longitude for the requested date the same way `planetaryPositions.ts` computes a planet's, and set `ayanamsa(date) = tropicalLongitude(Spica, date) − 180°`. Sidereal longitude for any body then follows directly: `sidereal = tropical − ayanamsa`.
2. **This is a documented, named ayanamsa variant, not "the" Lahiri ayanamsa.** N.C. Lahiri's original 1955 Calendar Reform Committee definition and the modern "True Chitrapaksha" definition used here agree closely (both anchor near Spica) but are not bit-identical — published tables for "Lahiri ayanamsa" from different software can disagree by up to roughly one arcminute depending on which historical polynomial they implement. This ADR picks the version that is exactly reproducible from first principles using only this codebase's already-trusted astronomy library, rather than one that requires trusting an external table. The calculation result is labeled `true_chitrapaksha` internally so a future addition of a second ayanamsa variant is not a breaking change.
3. **Nakshatra and pada are pure arithmetic on sidereal longitude.** 27 nakshatras of exactly 360°/27 = 13°20′ each, starting at 0° sidereal Aries; each nakshatra divides into 4 padas of 3°20′. No new astronomical calculation is needed once sidereal longitude exists.
4. **Vimshottari dasha is derived entirely from the Moon's sidereal longitude at birth**, using the standard fixed 120-year, 9-graha cycle (Ketu 7, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17 years) and the standard nakshatra-to-graha-lord repeating assignment (Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury, repeated three times across the 27 nakshatras). The birth lord's remaining balance is the fraction of that nakshatra still untraversed by the Moon at birth, multiplied by that graha's full period length; every subsequent mahadasha in the returned 120-year sequence runs its full fixed length, in the fixed graha order (not the nakshatra order), independent of which nakshatra it falls in. One "year" is fixed at exactly 365.25 days (a Julian year) for period-length arithmetic — a documented, defensible, and common convention, not a universal one; alternate year-length conventions used by some traditions are out of scope here. Only mahadashas (the top-level 9 periods) are computed; antardashas (sub-periods) are deferred.
5. **Rahu and Ketu (the lunar nodes) are computed for this module only, from `astronomy-engine`'s `SearchMoonNode`**, and are not yet exposed through the tropical chart engine — ADR-0002 explicitly deferred lunar nodes, and this ADR does not reopen that; the two calculations are independent and this one only feeds nakshatra-lord bookkeeping for Rahu/Ketu mahadashas, not a Rahu/Ketu chart position claim.

## Validation

Ayanamsa validation deliberately does **not** depend on copying a secondhand "Lahiri ayanamsa" lookup table, for the same reason ADR-0002 avoided depending on a secondhand Ascendant reference: the *definition* itself is directly, mechanically checkable.

- **Definitional invariant, checked directly**: for any date, computing Spica's sidereal longitude via this module's own `ayanamsa()` output must equal exactly 180° (`sidereal = tropical − ayanamsa = tropical − (tropical − 180) = 180`, so this is really testing that the subtraction and the star lookup agree with each other — a real regression-catcher for sign/unit errors, not a tautology, because the test recomputes Spica's tropical longitude independently through `calculateGeocentricEclipticPositions`-equivalent machinery rather than reusing `ayanamsa()`'s internal value).
- **Order-of-magnitude sanity bounds** against widely published Lahiri figures: ayanamsa near J2000 (2000-01-01) must fall within a few arcminutes of the commonly cited ≈23°51′ (23.85°), and the rate of increase over a century must be consistent with the general precession rate (~50.3″/year, i.e. ≈1.4° per century) — this catches a wrong star, wrong epoch, or a units bug that the definitional test alone could not.
- **Nakshatra**: boundary arithmetic tested exactly at each of the 27 division points (0°, 13°20′, 26°40′, ... including the 360°→0° wrap) and at each pada boundary within a nakshatra.
- **Vimshottari dasha**: the nine graha periods' full lengths must sum to exactly 120 years (a direct constant check); the standard nakshatra-lord table is asserted against its known repeating pattern for all 27 nakshatras; balance-of-dasha at birth is tested at the exact start of a nakshatra (must equal the full graha period), at its exact midpoint (must equal exactly half), and just before its end (must approach zero); consecutive periods in the generated nine-period sequence must chain with no gaps or overlaps (`period[i].endDate === period[i+1].startDate` exactly). The nine-period sequence returned from birth is the standard "life overview" convention most Vedic software shows — it does **not** sum to 120 years, because the first period is only the birth lord's *remaining* balance, not its full length. This is checked two ways: directly, the nine-period total must equal `120 − elapsedYears(birthLord)`; and independently, adding back the birth lord's already-elapsed portion (computed from the same fraction, not reused from the implementation's own return value) to that total must equal exactly 120 — the closed-cycle identity a correct implementation has to satisfy.

## Consequences

### Positive

- Every number in this line is either a direct output of `astronomy-engine`'s own tested precession/nutation model or exact arithmetic on top of it — no hand-derived trigonometric or polynomial ayanamsa formula, no Swiss Ephemeris dependency, no new npm package.
- The ayanamsa choice is named and reproducible from first principles by this codebase alone, so it does not silently drift if a future maintainer cannot find or trust the original secondhand table a different ayanamsa mode might have been copied from.

### Deferred

- **API route, LLM prompt family, Android UI, and content generation** — this ADR adds the calculation capability only, exactly as ADR-0002 added Ascendant/houses without wiring them anywhere. No caller reaches `chart-engine/vedic/` yet.
- **Antardashas and further dasha sub-periods.**
- **Alternate ayanamsa variants** (e.g. classic N.C. Lahiri polynomial, Raman, Krishnamurti) and alternate dasha year-length conventions.
- **Sidereal houses and a Vedic-specific house system** (Vedic astrology conventionally uses whole-sign houses from the sidereal Ascendant, which requires the birth-location-dependent Ascendant work from ADR-0002 plus this ADR's ayanamsa — not yet combined here).
- **Vedic-specific interpretation rules and disclaimers.**

## Primary references

- Astronomy Engine fixed-star support (`DefineStar`, and reusing `GeoVector`/`Ecliptic` exactly as for planets): `node_modules/astronomy-engine/astronomy.d.ts`, source https://github.com/cosinekitty/astronomy
- Astronomy Engine lunar node search (`SearchMoonNode`): same source
- ADR-0001: `docs/architecture/0001-chart-engine-ephemeris.md`
- ADR-0002: `docs/architecture/0002-chart-angles-and-houses.md`
- Spica (α Virginis) J2000 catalog coordinates: standard Hipparcos/SIMBAD values, RA 13h25m11.58s, Dec −11°09′41″
