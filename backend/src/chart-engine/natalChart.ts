import {
  calculateChartAngles,
  calculateWholeSignHouses,
  type ChartAngle,
  type GeographicObserver,
  type HouseCusps
} from '@/chart-engine/houses';
import {
  calculateGeocentricEclipticPositions,
  normalizeLongitude,
  type ChartBody,
  type GeocentricEclipticPosition
} from '@/chart-engine/planetaryPositions';

export type BirthTimeCertainty = 'exact' | 'approximate' | 'unknown';

export type MajorAspectType =
  | 'conjunction'
  | 'sextile'
  | 'square'
  | 'trine'
  | 'opposition';

export type AspectPosition = {
  body: ChartBody;
  longitude: number;
};

export type MajorAspect = {
  first: ChartBody;
  second: ChartBody;
  type: MajorAspectType;
  exactAngle: number;
  separation: number;
  orb: number;
};

export type NatalChartV1 = {
  version: 'natal-chart-v1';
  calculationVersion: 'astronomy-engine-2.1.19';
  calculatedAt: string;
  timestamp: string;
  timeCertainty: BirthTimeCertainty;
  referenceFrame: 'apparent-geocentric-true-ecliptic-of-date';
  positions: GeocentricEclipticPosition[];
  aspects: MajorAspect[];
  ascendant: ChartAngle | null;
  midheaven: ChartAngle | null;
  houses: HouseCusps | null;
  limitations: Array<
    | 'houses_and_ascendant_not_calculated'
    | 'birth_time_uncertain'
    | 'moon_position_time_sensitive'
  >;
};

const MAJOR_ASPECTS: ReadonlyArray<{
  type: MajorAspectType;
  angle: number;
  maximumOrb: number;
}> = [
  { type: 'conjunction', angle: 0, maximumOrb: 8 },
  { type: 'sextile', angle: 60, maximumOrb: 5 },
  { type: 'square', angle: 90, maximumOrb: 6 },
  { type: 'trine', angle: 120, maximumOrb: 7 },
  { type: 'opposition', angle: 180, maximumOrb: 8 }
];

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function roundAngle(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function circularSeparation(first: number, second: number): number {
  const distance = Math.abs(normalizeLongitude(first) - normalizeLongitude(second));
  return Math.min(distance, 360 - distance);
}

export function calculateMajorAspects(positions: AspectPosition[]): MajorAspect[] {
  const aspects: MajorAspect[] = [];

  for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
      const first = positions[firstIndex];
      const second = positions[secondIndex];
      const separation = circularSeparation(first.longitude, second.longitude);

      for (const definition of MAJOR_ASPECTS) {
        const orb = Math.abs(separation - definition.angle);
        if (orb <= definition.maximumOrb) {
          aspects.push({
            first: first.body,
            second: second.body,
            type: definition.type,
            exactAngle: definition.angle,
            separation: roundAngle(separation),
            orb: roundAngle(orb)
          });
          break;
        }
      }
    }
  }

  return aspects.sort((first, second) => first.orb - second.orb);
}

export function createNatalChart(input: {
  timestamp: string;
  timeCertainty: BirthTimeCertainty;
  /** Birth location. Required (alongside an exact birth time) to compute the Ascendant, Midheaven, and houses — see ADR-0002. */
  observer?: GeographicObserver;
}): NatalChartV1 {
  if (!ISO_TIMESTAMP_PATTERN.test(input.timestamp)) {
    throw new Error('timestamp must be an ISO 8601 UTC timestamp.');
  }

  const date = new Date(input.timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error('timestamp must be an ISO 8601 UTC timestamp.');
  }

  const positions = calculateGeocentricEclipticPositions(date);
  const limitations: NatalChartV1['limitations'] = [];
  if (input.timeCertainty !== 'exact') {
    limitations.push('birth_time_uncertain', 'moon_position_time_sensitive');
  }

  // Ascendant/Midheaven/houses shift by roughly a degree per few minutes of
  // birth time, so they are only computed when both a birth location and an
  // exactly-known birth time are available. This is the gating ADR-0002
  // flagged as still outstanding.
  let ascendant: ChartAngle | null = null;
  let midheaven: ChartAngle | null = null;
  let houses: HouseCusps | null = null;
  if (input.observer && input.timeCertainty === 'exact') {
    const angles = calculateChartAngles(date, input.observer);
    ascendant = angles.ascendant;
    midheaven = angles.midheaven;
    houses = calculateWholeSignHouses(angles.ascendant.longitude);
  } else {
    limitations.push('houses_and_ascendant_not_calculated');
  }

  return {
    version: 'natal-chart-v1',
    calculationVersion: 'astronomy-engine-2.1.19',
    calculatedAt: new Date().toISOString(),
    timestamp: date.toISOString(),
    timeCertainty: input.timeCertainty,
    referenceFrame: 'apparent-geocentric-true-ecliptic-of-date',
    positions,
    aspects: calculateMajorAspects(positions),
    ascendant,
    midheaven,
    houses,
    limitations
  };
}
