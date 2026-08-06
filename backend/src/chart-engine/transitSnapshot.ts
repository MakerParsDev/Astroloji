import {
  createNatalChart,
  type BirthTimeCertainty,
  type MajorAspectType,
  type NatalChartV1
} from '@/chart-engine/natalChart';
import {
  calculateGeocentricEclipticPositions,
  normalizeLongitude,
  type ChartBody,
  type GeocentricEclipticPosition
} from '@/chart-engine/planetaryPositions';

export type TransitAspect = {
  transitBody: ChartBody;
  natalBody: ChartBody;
  type: MajorAspectType;
  exactAngle: number;
  separation: number;
  orb: number;
  maximumOrb: number;
};

export type TransitSnapshotV1 = {
  version: 'transit-snapshot-v1';
  calculationVersion: 'astronomy-engine-2.1.19';
  calculatedAt: string;
  natalTimestamp: string;
  targetTimestamp: string;
  natalTimeCertainty: BirthTimeCertainty;
  natalPositions: GeocentricEclipticPosition[];
  transitPositions: GeocentricEclipticPosition[];
  aspects: TransitAspect[];
  limitations: NatalChartV1['limitations'];
};

const TRANSIT_ASPECTS: ReadonlyArray<{
  type: MajorAspectType;
  angle: number;
  maximumOrb: number;
}> = [
  { type: 'conjunction', angle: 0, maximumOrb: 3 },
  { type: 'sextile', angle: 60, maximumOrb: 2 },
  { type: 'square', angle: 90, maximumOrb: 3 },
  { type: 'trine', angle: 120, maximumOrb: 3 },
  { type: 'opposition', angle: 180, maximumOrb: 3 }
];

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_TRANSIT_ASPECTS = 30;

function roundAngle(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function circularSeparation(first: number, second: number): number {
  const distance = Math.abs(normalizeLongitude(first) - normalizeLongitude(second));
  return Math.min(distance, 360 - distance);
}

function parseUtcTimestamp(timestamp: string, fieldName: string): Date {
  if (!ISO_TIMESTAMP_PATTERN.test(timestamp)) {
    throw new Error(`${fieldName} must be an ISO 8601 UTC timestamp.`);
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be an ISO 8601 UTC timestamp.`);
  }
  return date;
}

export function calculateTransitAspects(
  natalPositions: GeocentricEclipticPosition[],
  transitPositions: GeocentricEclipticPosition[]
): TransitAspect[] {
  const aspects: TransitAspect[] = [];

  for (const transit of transitPositions) {
    for (const natal of natalPositions) {
      const separation = circularSeparation(transit.longitude, natal.longitude);
      for (const definition of TRANSIT_ASPECTS) {
        const orb = Math.abs(separation - definition.angle);
        if (orb <= definition.maximumOrb) {
          aspects.push({
            transitBody: transit.body,
            natalBody: natal.body,
            type: definition.type,
            exactAngle: definition.angle,
            separation: roundAngle(separation),
            orb: roundAngle(orb),
            maximumOrb: definition.maximumOrb
          });
          break;
        }
      }
    }
  }

  return aspects
    .sort((first, second) => first.orb - second.orb)
    .slice(0, MAX_TRANSIT_ASPECTS);
}

export function createTransitSnapshot(input: {
  natalTimestamp: string;
  natalTimeCertainty: BirthTimeCertainty;
  targetTimestamp: string;
}): TransitSnapshotV1 {
  const natalChart = createNatalChart({
    timestamp: input.natalTimestamp,
    timeCertainty: input.natalTimeCertainty
  });
  const targetDate = parseUtcTimestamp(input.targetTimestamp, 'targetTimestamp');
  const transitPositions = calculateGeocentricEclipticPositions(targetDate);

  return {
    version: 'transit-snapshot-v1',
    calculationVersion: 'astronomy-engine-2.1.19',
    calculatedAt: new Date().toISOString(),
    natalTimestamp: natalChart.timestamp,
    targetTimestamp: targetDate.toISOString(),
    natalTimeCertainty: natalChart.timeCertainty,
    natalPositions: natalChart.positions,
    transitPositions,
    aspects: calculateTransitAspects(natalChart.positions, transitPositions),
    limitations: natalChart.limitations
  };
}
