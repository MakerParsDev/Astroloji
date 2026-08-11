import type { Hono } from 'hono';

import { searchCities } from '@/services/cityLookup';
import type { AppBindings } from '@/types';

const MAX_LIMIT = 20;

/**
 * Public, unauthenticated: the onboarding city picker runs before the user
 * has an account (registration happens after sign/date/city are chosen), and
 * the dataset itself is a static, non-sensitive list of major cities — see
 * data/majorCities.ts.
 */
export function registerCityRoutes(app: Hono<AppBindings>) {
  app.get('/cities/search', (c) => {
    const query = c.req.query('q') ?? '';
    const requestedLimit = Number.parseInt(c.req.query('limit') ?? '', 10);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : undefined;

    return c.json({ cities: searchCities(query, limit) });
  });
}
