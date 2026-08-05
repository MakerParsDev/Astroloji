# Astronomy golden fixtures

`jpl-horizons-geocentric-ecliptic-2026-08-05.json` is a recorded test fixture, not a runtime dependency.

It was retrieved on 2026-08-05 from the NASA/JPL Horizons GET API using:

- center: `500@399` (Earth geocenter)
- ephemeris type: `OBSERVER`
- quantity: `31` (apparent ecliptic longitude and latitude)
- time type: `UT`
- timestamp: `2026-08-05 00:00`
- CSV output enabled

Target commands were `10`, `301`, `199`, `299`, `499`, `599`, `699`, `799`, `899`, and `999` for Sun through Pluto as listed in the fixture.

The live response signature reported API version `1.2`; this is preserved in the fixture. Tests compare angular distance with a one-arcminute maximum tolerance and never call JPL over the network.

Before replacing this fixture:

1. Confirm the current API documentation and response signature version.
2. Preserve center, time scale, coordinate quantity, and aberration semantics.
3. Review the diff body by body.
4. Run the complete backend and runtime test suites.
