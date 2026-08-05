import { Hono } from 'hono';

import { createNatalChart } from '@/chart-engine/natalChart';
import { createPersonalGuidance } from '@/chart-engine/personalGuidance';
import { createTransitSnapshot } from '@/chart-engine/transitSnapshot';
import type { AppBindings } from '@/types';
import {
  validateNatalChartBody,
  validatePersonalGuidanceBody,
  validateTransitChartBody
} from '@/utils/validators';

export function registerChartRoutes(app: Hono<AppBindings>) {
  app.post('/chart/natal', async (context) => {
    const request = validateNatalChartBody(await context.req.json());
    return context.json(
      createNatalChart({
        timestamp: request.timestamp,
        timeCertainty: request.time_certainty
      })
    );
  });

  app.post('/chart/transits', async (context) => {
    const request = validateTransitChartBody(await context.req.json());
    return context.json(
      createTransitSnapshot({
        natalTimestamp: request.natal_timestamp,
        natalTimeCertainty: request.natal_time_certainty,
        targetTimestamp: request.target_timestamp
      })
    );
  });

  app.post('/chart/guidance', async (context) => {
    const request = validatePersonalGuidanceBody(await context.req.json());
    return context.json(
      createPersonalGuidance({
        natalTimestamp: request.natal_timestamp,
        natalTimeCertainty: request.natal_time_certainty,
        targetTimestamp: request.target_timestamp,
        language: request.language
      })
    );
  });
}
