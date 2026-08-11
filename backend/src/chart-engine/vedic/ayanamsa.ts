import { Body, DefineStar, Ecliptic, GeoVector } from 'astronomy-engine';

import { normalizeLongitude } from '@/chart-engine/planetaryPositions';

/**
 * Spica (α Virginis), J2000 catalog coordinates (Hipparcos/SIMBAD).
 * RA 13h25m11.58s -> decimal hours; Dec -11d09m41s -> decimal degrees.
 * Distance (~250 ly) only affects the negligible stellar parallax term.
 */
const SPICA_RA_HOURS = 13 + 25 / 60 + 11.58 / 3600;
const SPICA_DEC_DEGREES = -(11 + 9 / 60 + 41 / 3600);
const SPICA_DISTANCE_LIGHT_YEARS = 250;

const SPICA_SIDEREAL_LONGITUDE = 180;

let spicaDefined = false;

function ensureSpicaDefined(): void {
  if (spicaDefined) {
    return;
  }
  DefineStar(Body.Star1, SPICA_RA_HOURS, SPICA_DEC_DEGREES, SPICA_DISTANCE_LIGHT_YEARS);
  spicaDefined = true;
}

/**
 * Spica's apparent tropical (true-ecliptic-of-date) longitude for the given
 * date, computed the same way `planetaryPositions.ts` computes a planet's:
 * geocentric vector with aberration, then true-ecliptic-of-date longitude.
 */
export function spicaTropicalLongitude(date: Date): number {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for ayanamsa calculation.');
  }
  ensureSpicaDefined();
  const vector = GeoVector(Body.Star1, date, true);
  const ecliptic = Ecliptic(vector);
  return normalizeLongitude(ecliptic.elon);
}

/**
 * True Chitrapaksha ayanamsa: the offset between the tropical and sidereal
 * zodiacs, defined so Spica always sits at exactly 180 degrees sidereal
 * longitude (0 degrees Libra). See ADR-0003 for why this specific,
 * self-consistent definition was chosen over a secondhand polynomial.
 */
export function ayanamsa(date: Date): number {
  return normalizeLongitude(spicaTropicalLongitude(date) - SPICA_SIDEREAL_LONGITUDE);
}

/** Converts a tropical ecliptic longitude to sidereal using this module's ayanamsa. */
export function tropicalToSidereal(tropicalLongitude: number, date: Date): number {
  return normalizeLongitude(tropicalLongitude - ayanamsa(date));
}
