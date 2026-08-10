import {
  EquatorFromVector,
  Horizon,
  Observer as AstronomyObserver,
  Rotation_ECT_EQD,
  RotateVector,
  SiderealTime,
  Spherical,
  VectorFromSphere
} from 'astronomy-engine';
import { describe, expect, it } from 'vitest';

import {
  calculateChartAngles,
  calculateWholeSignHouses,
  localSiderealTimeDegrees
} from '@/chart-engine/houses';
import { normalizeLongitude } from '@/chart-engine/planetaryPositions';

const TEST_DATE = new Date('2026-08-10T12:00:00.000Z');

/** Maps any degree value to the (-180, 180] range Observer.longitude requires. */
function toSignedLongitude(degrees: number): number {
  const normalized = normalizeLongitude(degrees);
  return normalized > 180 ? normalized - 360 : normalized;
}

/** Chooses an observer longitude so that local sidereal time at TEST_DATE equals the target degrees. */
function longitudeForLocalSiderealTime(targetLstDeg: number): number {
  const greenwichSiderealDegrees = SiderealTime(TEST_DATE) * 15;
  return toSignedLongitude(targetLstDeg - greenwichSiderealDegrees);
}

describe('calculateChartAngles', () => {
  it('places the vernal equinox point (0° Aries) exactly on the rising Ascendant when LST = 270°', () => {
    // At RA=0°, Dec=0° (the vernal equinox point), altitude = 0 at hour angle
    // = ±90°; standard spherical astronomy (sin(alt) = cosφ·cos(H), δ=0) puts
    // the rising crossing at H = -90°, i.e. LST = RA + H = 270°. This is an
    // exact, independently-derivable special case, not a value copied from
    // this module's own output.
    const observer = { latitude: 45, longitude: longitudeForLocalSiderealTime(270) };

    const angles = calculateChartAngles(TEST_DATE, observer);

    expect(angles.ascendant.longitude).toBeCloseTo(0, 6);
    expect(angles.ascendant.zodiac.sign).toBe('aries');
  });

  it('places the Midheaven exactly on 0° Aries when LST = 0°', () => {
    // The vernal equinox point has RA=0°, so it sits on the local meridian
    // (hour angle 0) exactly when LST=0° — and since it is also, by
    // definition, on the ecliptic itself, that meridian crossing IS the MC.
    const observer = { latitude: 45, longitude: longitudeForLocalSiderealTime(0) };

    const angles = calculateChartAngles(TEST_DATE, observer);

    // Compare across the 0°/360° wrap boundary — the root can converge to
    // either side (e.g. 359.9999998°), which is the same angle as ~0° but
    // numerically far from it for a plain toBeCloseTo(0), and can likewise
    // land a hair inside Pisces rather than Aries despite being the same
    // instant, so the sign itself isn't asserted here.
    expect(Math.min(angles.midheaven.longitude, 360 - angles.midheaven.longitude)).toBeCloseTo(0, 6);
  });

  it('keeps the Descendant exactly opposite the Ascendant', () => {
    const angles = calculateChartAngles(TEST_DATE, { latitude: 41, longitude: 29 });

    expect(normalizeLongitude(angles.descendant.longitude - angles.ascendant.longitude)).toBeCloseTo(180, 6);
  });

  it('keeps the Imum Coeli exactly opposite the Midheaven', () => {
    const angles = calculateChartAngles(TEST_DATE, { latitude: 41, longitude: 29 });

    expect(normalizeLongitude(angles.imumCoeli.longitude - angles.midheaven.longitude)).toBeCloseTo(180, 6);
  });

  it('computes a Midheaven independent of observer latitude, holding longitude fixed', () => {
    const north = calculateChartAngles(TEST_DATE, { latitude: 60, longitude: 15 });
    const south = calculateChartAngles(TEST_DATE, { latitude: -30, longitude: 15 });
    const equator = calculateChartAngles(TEST_DATE, { latitude: 0.001, longitude: 15 });

    expect(north.midheaven.longitude).toBeCloseTo(south.midheaven.longitude, 6);
    expect(north.midheaven.longitude).toBeCloseTo(equator.midheaven.longitude, 6);
  });

  it('produces an Ascendant that is genuinely rising: altitude one minute later is higher', () => {
    const observer = { latitude: 41, longitude: 29 };
    const angles = calculateChartAngles(TEST_DATE, observer);

    // Re-derive independently within the test rather than reusing houses.ts internals,
    // so this check does not just restate the production code's own bisection target.
    const engineObserver = new AstronomyObserver(observer.latitude, observer.longitude, 0);
    const altitudeAt = (time: Date) => {
      const eclipticVector = VectorFromSphere(new Spherical(0, angles.ascendant.longitude, 1), time);
      const equatorialVector = RotateVector(Rotation_ECT_EQD(time), eclipticVector);
      const { ra, dec } = EquatorFromVector(equatorialVector);
      return Horizon(time, engineObserver, ra, dec).altitude;
    };

    expect(altitudeAt(TEST_DATE)).toBeCloseTo(0, 4);
    expect(altitudeAt(new Date(TEST_DATE.getTime() + 60_000))).toBeGreaterThan(altitudeAt(TEST_DATE));
  });

  it('rejects an invalid observer latitude', () => {
    expect(() => calculateChartAngles(TEST_DATE, { latitude: 91, longitude: 0 })).toThrow(/latitude/);
  });

  it('rejects an invalid observer longitude', () => {
    expect(() => calculateChartAngles(TEST_DATE, { latitude: 0, longitude: 181 })).toThrow(/longitude/);
  });

  it('rejects an invalid date', () => {
    expect(() => calculateChartAngles(new Date('not a date'), { latitude: 0, longitude: 0 })).toThrow(/date/i);
  });
});

describe('localSiderealTimeDegrees', () => {
  it('matches the longitude chosen to target a specific LST', () => {
    const target = 123.456;
    const longitude = longitudeForLocalSiderealTime(target);

    expect(localSiderealTimeDegrees(TEST_DATE, longitude)).toBeCloseTo(target, 6);
  });
});

describe('calculateWholeSignHouses', () => {
  it('starts house 1 at the Ascendant sign boundary and spaces every cusp exactly 30° apart', () => {
    const houses = calculateWholeSignHouses(47.3); // mid-Taurus

    expect(houses.system).toBe('whole_sign');
    expect(houses.cusps).toHaveLength(12);
    expect(houses.cusps[0]).toMatchObject({ house: 1, longitude: 30, zodiac: { sign: 'taurus', degree: 0 } });
    expect(houses.cusps[1]).toMatchObject({ house: 2, longitude: 60, zodiac: { sign: 'gemini', degree: 0 } });
    for (let index = 1; index < houses.cusps.length; index += 1) {
      const delta = normalizeLongitude(houses.cusps[index].longitude - houses.cusps[index - 1].longitude);
      expect(delta).toBe(30);
    }
  });

  it('wraps house 12 back toward Aries when the Ascendant is late in the zodiac', () => {
    const houses = calculateWholeSignHouses(355); // late Pisces

    expect(houses.cusps[0].zodiac.sign).toBe('pisces');
    expect(houses.cusps[11].zodiac.sign).toBe('aquarius');
  });

  it('aligns with the Ascendant sign produced by calculateChartAngles', () => {
    const angles = calculateChartAngles(TEST_DATE, { latitude: 41, longitude: 29 });
    const houses = calculateWholeSignHouses(angles.ascendant.longitude);

    expect(houses.cusps[0].zodiac.sign).toBe(angles.ascendant.zodiac.sign);
  });
});
