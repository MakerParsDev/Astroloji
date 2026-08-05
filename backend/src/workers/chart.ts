import { Hono } from 'hono';

import { createNatalChart } from '@/chart-engine/natalChart';
import type { AppBindings } from '@/types';
import { validateNatalChartBody } from '@/utils/validators';

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
}
