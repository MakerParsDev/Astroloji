# ADR 0001: Chart Engine Ephemeris Foundation

- **Status:** Accepted for the first production spike
- **Date:** 2026-08-05
- **Scope:** Backend astronomical facts only

## Context

The product needs real, reproducible Sun, Moon, and planetary positions before it can claim personal chart or transit-based guidance. The first implementation must be commercially usable, deterministic in Cloudflare Workers, independently testable, and explicit about unsupported claims.

## Decision

1. Pin `astronomy-engine` to `2.1.19` and use its JavaScript implementation for geocentric apparent true-ecliptic-of-date positions.
2. Validate a fixed timestamp against recorded NASA/JPL Horizons observer quantity 31 data. JPL is a build/test reference only; production requests never call the Horizons network service.
3. Publish the first result as `NatalChartV1` with calculation version `astronomy-engine-2.1.19`.
4. Calculate only:
   - Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto longitudes/latitudes;
   - tropical zodiac sign and degree;
   - bounded major aspects.
5. Return `null` for houses and ascendant until a separately validated house-system implementation exists.
6. Mark unknown or approximate birth time explicitly. In particular, Moon position and all time-sensitive angles must carry a limitation rather than false precision.
7. The chart endpoint is authenticated, rate-limited, and stateless. Birth timestamps are not written to D1, R2, analytics, or logs by this feature.

## Licensing

- Astronomy Engine is distributed under the MIT License and supports JavaScript and Kotlin/JVM.
- Swiss Ephemeris is not adopted in this phase. Its AGPL/commercial dual-license requirements require a separate legal and architecture decision before use.
- Package versions are exact, not caret ranges, for calculation reproducibility.

## Validation

The golden fixture records geocentric apparent ecliptic longitude and latitude from NASA/JPL Horizons for `2026-08-05T00:00:00.000Z`. All ten supported bodies must stay within one arcminute of the fixture.

The test suite also verifies:

- circular zodiac boundaries, including negative and 360-degree inputs;
- invalid timestamp rejection;
- major-aspect circular separation and orb limits;
- no invented houses or ascendant;
- no database write from the chart endpoint.

## Consequences

### Positive

- Reproducible astronomical facts replace generic sign-only assumptions.
- The implementation is small enough for Worker runtime and does not depend on an external ephemeris service at request time.
- Calculation limitations are machine-readable and visible to future Android UI.

### Deferred

- Geographic observer input, timezone conversion, DST resolution, ascendant, Midheaven, houses, nodes, Chiron, and additional points.
- Independent fixtures for multiple centuries and DST/location edge cases.
- A separate interpretation rules engine that converts facts into safe narrative signals.

## Primary references

- Astronomy Engine: https://github.com/cosinekitty/astronomy
- NASA/JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- Swiss Ephemeris licensing: https://www.astro.com/swisseph/
