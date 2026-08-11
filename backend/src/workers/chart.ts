import { Hono } from 'hono';

import { createNatalChart } from '@/chart-engine/natalChart';
import { createPersonalGuidance } from '@/chart-engine/personalGuidance';
import { createTransitSnapshot } from '@/chart-engine/transitSnapshot';
import { createVedicChart } from '@/chart-engine/vedic/vedicChart';
import type { AppBindings } from '@/types';
import {
  validateNatalChartBody,
  validatePersonalGuidanceBody,
  validateTransitChartBody
} from '@/utils/validators';
import { getDecryptedBirthData } from '@/workers/birthData';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export function registerChartRoutes(app: Hono<AppBindings>) {
  app.post('/chart/natal', async (context) => {
    const request = validateNatalChartBody(await context.req.json());
    return context.json(
      createNatalChart({
        timestamp: request.timestamp,
        timeCertainty: request.time_certainty,
        observer: request.observer
      })
    );
  });

  app.post('/chart/vedic', async (context) => {
    const request = validateNatalChartBody(await context.req.json());
    return context.json(
      createVedicChart({
        timestamp: request.timestamp,
        timeCertainty: request.time_certainty
      })
    );
  });

  app.get('/chart/vedic/me', async (context) => {
    const auth = context.get('auth');
    const birthData = await getDecryptedBirthData(context.env, auth.userId);
    if (!birthData) {
      return jsonError(
        400,
        'BIRTH_DATA_REQUIRED',
        'Save your birth date, time, and city before requesting your Vedic chart.'
      );
    }

    return context.json(
      createVedicChart({
        timestamp: birthData.plaintext.timestamp,
        timeCertainty: birthData.timeCertainty
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
