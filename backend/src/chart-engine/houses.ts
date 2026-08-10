import {
  EquatorFromVector,
  Horizon,
  Observer,
  Rotation_ECT_EQD,
  RotateVector,
  SiderealTime,
  Spherical,
  Vector,
  VectorFromSphere
} from 'astronomy-engine';

import { normalizeLongitude, zodiacPosition, type ZodiacPosition } from '@/chart-engine/planetaryPositions';

export type GeographicObserver = {
  /** Degrees north of the equator; negative is south. */
  latitude: number;
  /** Degrees east of Greenwich; negative is west. */
  longitude: number;
};

export type ChartAngle = {
  longitude: number;
  zodiac: ZodiacPosition;
};

export type ChartAngles = {
  ascendant: ChartAngle;
  descendant: ChartAngle;
  midheaven: ChartAngle;
  imumCoeli: ChartAngle;
};

/** Whole Sign is the only house system implemented so far — see ADR-0002. Placidus is deferred. */
export type HouseSystem = 'whole_sign';

export type HouseCusp = {
  house: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  longitude: number;
  zodiac: ZodiacPosition;
};

export type HouseCusps = {
  system: HouseSystem;
  cusps: HouseCusp[];
};

const SEARCH_STEPS = 720; // 0.5° grid — coarse enough to be cheap, fine enough that a bracket never spans more than one root
const BISECTION_ITERATIONS = 40; // 360° / 2^40 ≈ 3e-10°, far below any meaningful precision floor
const RISING_CHECK_OFFSET_MS = 60_000;

/**
 * Right ascension / declination of the point on the true ecliptic of `time`
 * at the given ecliptic longitude (latitude fixed at 0, since angle-of-the-day
 * points — Ascendant, Midheaven — are by definition ON the ecliptic).
 *
 * Deliberately built only from astronomy-engine's own documented, paired
 * primitives (VectorFromSphere / Rotation_ECT_EQD / EquatorFromVector) rather
 * than a hand-derived trigonometric formula, so this inherits the library's
 * own tested obliquity/precession/nutation handling instead of risking a
 * sign or frame-convention error in a re-derivation.
 */
function equatorialFromEclipticLongitude(
  time: Date,
  longitudeDeg: number
): { raHours: number; decDeg: number } {
  const eclipticVector = VectorFromSphere(new Spherical(0, normalizeLongitude(longitudeDeg), 1), time);
  const equatorialVector = RotateVector(Rotation_ECT_EQD(time), eclipticVector);
  const equatorial = EquatorFromVector(equatorialVector);
  return { raHours: equatorial.ra, decDeg: equatorial.dec };
}

function altitudeAtEclipticLongitude(time: Date, observer: Observer, longitudeDeg: number): number {
  const { raHours, decDeg } = equatorialFromEclipticLongitude(time, longitudeDeg);
  return Horizon(time, observer, raHours, decDeg).altitude;
}

/** Local sidereal time in degrees [0, 360). */
export function localSiderealTimeDegrees(time: Date, observerLongitude: number): number {
  const greenwichSiderealDegrees = SiderealTime(time) * 15;
  return normalizeLongitude(greenwichSiderealDegrees + observerLongitude);
}

function wrapSigned(angleDeg: number): number {
  const normalized = normalizeLongitude(angleDeg);
  return normalized > 180 ? normalized - 360 : normalized;
}

function bisect(f: (x: number) => number, low: number, high: number): number {
  let lowValue = f(low);
  let a = low;
  let b = high;
  for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration += 1) {
    const mid = (a + b) / 2;
    const midValue = f(mid);
    if (Math.sign(midValue) === Math.sign(lowValue) && midValue !== 0) {
      a = mid;
      lowValue = midValue;
    } else {
      b = mid;
    }
  }
  return (a + b) / 2;
}

/**
 * Finds every longitude in [0, 360) where a 360°-periodic function crosses
 * zero, via coarse sampling + bisection.
 *
 * When `f` is built from a `wrapSigned`-style angular difference (as the
 * Midheaven search below is), the function itself has an artificial jump
 * from just under +180 to just over -180 at its wrap boundary — that jump
 * flips sign exactly like a real crossing would, so a naive sign-change scan
 * reports a spurious root there in addition to the genuine one. Requiring
 * the sampled values themselves to be close together (`< 180` apart) is
 * what distinguishes "the function actually passed through zero between
 * these two samples" from "the function wrapped around". Genuine crossings
 * of any function sampled at this resolution never jump anywhere near that
 * much between adjacent 0.5° samples, so the filter never excludes a real
 * root — only the wrap artifact.
 */
function findZeroCrossings(f: (longitudeDeg: number) => number): number[] {
  const samples: number[] = new Array(SEARCH_STEPS);
  for (let index = 0; index < SEARCH_STEPS; index += 1) {
    samples[index] = f((index * 360) / SEARCH_STEPS);
  }
  // A sample landing exactly on zero (common at deliberately-constructed exact
  // test angles) must belong to exactly one bracket, not the two it borders —
  // otherwise that single root gets bisected and reported twice. Treating an
  // exact zero as positive, consistently on both sides of the comparison, is
  // the standard way to break that tie without double- or under-counting.
  const signOf = (value: number) => (value < 0 ? -1 : 1);

  const roots: number[] = [];
  for (let index = 0; index < SEARCH_STEPS; index += 1) {
    const low = (index * 360) / SEARCH_STEPS;
    const high = ((index + 1) * 360) / SEARCH_STEPS;
    const lowValue = samples[index];
    const highValue = samples[(index + 1) % SEARCH_STEPS];
    if (signOf(lowValue) !== signOf(highValue) && Math.abs(highValue - lowValue) < 180) {
      roots.push(normalizeLongitude(bisect(f, low, high)));
    }
  }
  return roots;
}

function toAngle(longitudeDeg: number): ChartAngle {
  const longitude = normalizeLongitude(longitudeDeg);
  return { longitude, zodiac: zodiacPosition(longitude) };
}

/**
 * Calculates the Ascendant, Descendant, Midheaven (MC), and Imum Coeli (IC)
 * for a birth moment and location.
 *
 * The Ascendant/Descendant are the two points where the ecliptic crosses the
 * local horizon; the Ascendant is disambiguated from the Descendant by
 * checking that its altitude is increasing (rising) a minute later — this is
 * the physical definition of "rising", not a formula guess. The Midheaven is
 * the point where the ecliptic crosses the local meridian (hour angle 0);
 * because that condition never involves the observer's latitude, MC/IC are
 * latitude-independent by construction here, matching classical astrology.
 *
 * Throws if the ecliptic does not cross the local horizon at all — this is a
 * genuine astronomical degeneracy near the poles (roughly beyond ±66.5°
 * latitude for parts of the year), not a bug; whole-sign and all other house
 * systems are undefined there too.
 */
export function calculateChartAngles(time: Date, observerInput: GeographicObserver): ChartAngles {
  if (Number.isNaN(time.getTime())) {
    throw new Error('Invalid date for chart angle calculation.');
  }
  if (!Number.isFinite(observerInput.latitude) || Math.abs(observerInput.latitude) > 90) {
    throw new Error('Observer latitude must be a finite number in [-90, 90].');
  }
  if (!Number.isFinite(observerInput.longitude) || Math.abs(observerInput.longitude) > 180) {
    throw new Error('Observer longitude must be a finite number in [-180, 180].');
  }

  const observer = new Observer(observerInput.latitude, observerInput.longitude, 0);

  const horizonCrossings = findZeroCrossings((longitude) => altitudeAtEclipticLongitude(time, observer, longitude));
  if (horizonCrossings.length !== 2) {
    throw new Error(
      `The ecliptic does not cross the horizon exactly twice at this latitude/time (found ${horizonCrossings.length}); Ascendant and house cusps are undefined here.`
    );
  }

  const laterTime = new Date(time.getTime() + RISING_CHECK_OFFSET_MS);
  const [first, second] = horizonCrossings;
  const firstIsRising =
    altitudeAtEclipticLongitude(laterTime, observer, first) > altitudeAtEclipticLongitude(time, observer, first);
  const ascendantLongitude = firstIsRising ? first : second;
  const descendantLongitude = firstIsRising ? second : first;

  const lst = localSiderealTimeDegrees(time, observerInput.longitude);
  const meridianCrossings = findZeroCrossings((longitude) => {
    const { raHours } = equatorialFromEclipticLongitude(time, longitude);
    return wrapSigned(raHours * 15 - lst);
  });
  if (meridianCrossings.length !== 1) {
    throw new Error(
      `The ecliptic must cross the local meridian exactly once (found ${meridianCrossings.length}); this indicates a calculation error.`
    );
  }
  const midheavenLongitude = meridianCrossings[0];

  return {
    ascendant: toAngle(ascendantLongitude),
    descendant: toAngle(descendantLongitude),
    midheaven: toAngle(midheavenLongitude),
    imumCoeli: toAngle(midheavenLongitude + 180)
  };
}

const HOUSE_NUMBERS: HouseCusp['house'][] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Whole Sign houses: house 1 spans the entire zodiac sign containing the
 * Ascendant (not just the Ascendant's exact degree onward), house 2 is the
 * next sign, and so on. This is the simplest, oldest, and least
 * calculation-sensitive house system — no latitude-dependent iteration, no
 * polar degeneracy beyond the Ascendant's own. Placidus is deferred (see
 * ADR-0002) pending a separately verified iterative implementation.
 */
export function calculateWholeSignHouses(ascendantLongitude: number): HouseCusps {
  const ascendantSignIndex = Math.floor(normalizeLongitude(ascendantLongitude) / 30);

  return {
    system: 'whole_sign',
    cusps: HOUSE_NUMBERS.map((house) => {
      const longitude = normalizeLongitude((ascendantSignIndex + (house - 1)) * 30);
      return { house, longitude, zodiac: zodiacPosition(longitude) };
    })
  };
}

// Re-exported for callers that only have a raw Vector already in true-ecliptic-of-date
// coordinates and want to sanity-check this module's frame assumptions against it.
export type { Vector };
