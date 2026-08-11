import { ayanamsa } from '@/chart-engine/vedic/ayanamsa';
import {
  calculateVimshottariMahadashas,
  type VimshottariGraha
} from '@/chart-engine/vedic/dasha';
import { nakshatraPosition, type Nakshatra } from '@/chart-engine/vedic/nakshatra';
import {
  calculateSiderealPositions,
  type SiderealPosition
} from '@/chart-engine/vedic/siderealPositions';

export type BirthTimeCertainty = 'exact' | 'approximate' | 'unknown';

export type MoonNakshatra = {
  nakshatra: Nakshatra;
  index: number;
  pada: 1 | 2 | 3 | 4;
};

export type Mahadasha = {
  graha: VimshottariGraha;
  startDate: string;
  endDate: string;
  years: number;
};

export type VedicChartV1 = {
  version: 'vedic-chart-v1';
  calculationVersion: 'astronomy-engine-2.1.19-true-chitrapaksha';
  calculatedAt: string;
  timestamp: string;
  timeCertainty: BirthTimeCertainty;
  /** Degrees. See ADR-0003 for why this is the True Chitrapaksha variant, not a secondhand Lahiri table. */
  ayanamsa: number;
  positions: SiderealPosition[];
  moonNakshatra: MoonNakshatra;
  mahadashas: Mahadasha[];
  limitations: Array<'birth_time_uncertain' | 'moon_position_time_sensitive'>;
};

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function createVedicChart(input: {
  timestamp: string;
  timeCertainty: BirthTimeCertainty;
}): VedicChartV1 {
  if (!ISO_TIMESTAMP_PATTERN.test(input.timestamp)) {
    throw new Error('timestamp must be an ISO 8601 UTC timestamp.');
  }

  const date = new Date(input.timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error('timestamp must be an ISO 8601 UTC timestamp.');
  }

  const positions = calculateSiderealPositions(date);
  const moonPosition = positions.find((position) => position.body === 'moon');
  if (!moonPosition) {
    throw new Error('Sidereal Moon position was not calculated.');
  }

  const moonNakshatraPosition = nakshatraPosition(moonPosition.longitude);
  const mahadashas = calculateVimshottariMahadashas(moonPosition.longitude, date).map((period) => ({
    graha: period.graha,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    years: period.years
  }));

  const limitations: VedicChartV1['limitations'] = [];
  if (input.timeCertainty !== 'exact') {
    // Nakshatra/dasha are derived entirely from the Moon's position, which
    // moves roughly half a degree per hour -- the same time-sensitivity
    // ADR-0001 already flags for the tropical Moon.
    limitations.push('birth_time_uncertain', 'moon_position_time_sensitive');
  }

  return {
    version: 'vedic-chart-v1',
    calculationVersion: 'astronomy-engine-2.1.19-true-chitrapaksha',
    calculatedAt: new Date().toISOString(),
    timestamp: date.toISOString(),
    timeCertainty: input.timeCertainty,
    ayanamsa: ayanamsa(date),
    positions,
    moonNakshatra: {
      nakshatra: moonNakshatraPosition.nakshatra,
      index: moonNakshatraPosition.index,
      pada: moonNakshatraPosition.pada
    },
    mahadashas,
    limitations
  };
}
