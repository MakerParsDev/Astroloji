import { Hono } from 'hono';
import { ZodError } from 'zod';

import {
  adminSecretMiddleware,
  contentCacheBypassMiddleware,
  jwtAuthMiddleware
} from '@/middleware/auth';
import { corsMiddleware } from '@/middleware/cors';
import { renderAccountDeletion, renderPrivacyPolicy, renderTermsOfUse } from '@/pages/legal';
import { parseShareSign, renderCompatibilityShare, renderDailyShare } from '@/pages/share';
import { enforceRateLimit } from '@/services/cache';
import type { AppBindings } from '@/types';
import type { RewardRouteDependencies } from '@/workers/reward';
import { validateTrackEventBody } from '@/utils/validators';
import { registerChartRoutes } from '@/workers/chart';
import { registerContentAdminRoutes, registerContentRoutes } from '@/workers/content';
import { handleCron } from '@/workers/cron';
import { registerNotificationRoutes } from '@/workers/notification';
import { registerRewardRoutes } from '@/workers/reward';
import {
  registerSubscriptionAdminRoutes,
  registerSubscriptionRoutes
} from '@/workers/subscription';
import { registerUserRoutes } from '@/workers/user';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export interface CreateAppOptions {
  reward?: RewardRouteDependencies;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<AppBindings>();

  app.use('*', corsMiddleware);
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('isAdmin', false);
    c.set('bypassCache', false);
    c.header('x-request-id', c.get('requestId'));
    await next();
  });

  app.onError((error) => {
    if (error instanceof ZodError) {
      return jsonError(
        400,
        'INVALID_REQUEST',
        error.issues[0]?.message ?? 'Request validation failed.'
      );
    }

    if (error instanceof SyntaxError) {
      return jsonError(400, 'INVALID_REQUEST', 'Request body must be valid JSON.');
    }

    console.error(error);
    return jsonError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
  });

  const renderHtmlPage = (html: string) => {
    const headers = new Headers({
      'cache-control': 'public, max-age=3600',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'content-type': 'text/html; charset=UTF-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    });
    return new Response(html, { status: 200, headers });
  };

  app.get('/privacy', () => renderHtmlPage(renderPrivacyPolicy()));
  app.get('/terms', () => renderHtmlPage(renderTermsOfUse()));
  app.get('/delete-account', () => renderHtmlPage(renderAccountDeletion()));
  app.get('/share/daily/:sign', (context) => {
    const sign = parseShareSign(context.req.param('sign'));
    return sign ? renderHtmlPage(renderDailyShare(sign)) : context.notFound();
  });
  app.get('/share/compat/:first/:second', (context) => {
    const first = parseShareSign(context.req.param('first'));
    const second = parseShareSign(context.req.param('second'));
    if (!first || !second) return context.notFound();
    const canonical = [first, second].sort();
    if (first !== canonical[0] || second !== canonical[1]) {
      return context.redirect(`/share/compat/${canonical[0]}/${canonical[1]}`, 308);
    }
    return renderHtmlPage(renderCompatibilityShare(first, second));
  });

  app.get('/api/v1/health', async (c) => {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    await c.env.CONTENT.head('healthcheck');

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  const apiRoutes = new Hono<AppBindings>();
  const apiAdminRoutes = new Hono<AppBindings>();
  const buildContentRateLimitKey = (path: string, userId: string) => {
    const type = path.split('/').at(-1) ?? 'unknown';
    return `content:${type}:${userId}`;
  };

  apiRoutes.use('/users/me', jwtAuthMiddleware);
  apiRoutes.use('/users/refresh-token', jwtAuthMiddleware);
  apiRoutes.use('/rewards/prepare', jwtAuthMiddleware);
  apiRoutes.use('/rewards/claim', jwtAuthMiddleware);
  apiRoutes.use('/chart/*', jwtAuthMiddleware);
  apiRoutes.use('/content/*', jwtAuthMiddleware);
  apiRoutes.use('/content/*', contentCacheBypassMiddleware);
  apiRoutes.use('/content/*', async (c, next) => {
    const allowed = await enforceRateLimit(
      c.env,
      buildContentRateLimitKey(c.req.path, c.get('auth').userId),
      60,
      60
    );
    if (!allowed) {
      return jsonError(429, 'RATE_LIMITED', 'Too many content requests.');
    }
    await next();
  });
  apiRoutes.use('/chart/*', async (c, next) => {
    const allowed = await enforceRateLimit(
      c.env,
      `chart:${c.get('auth').userId}`,
      30,
      60
    );
    if (!allowed) {
      return jsonError(429, 'RATE_LIMITED', 'Too many chart requests.');
    }
    await next();
  });
  apiRoutes.use('/subscriptions/verify', jwtAuthMiddleware);
  apiRoutes.use('/subscriptions/restore', jwtAuthMiddleware);
  apiRoutes.use('/events/track', jwtAuthMiddleware);

  registerUserRoutes(apiRoutes);
  registerChartRoutes(apiRoutes);
  registerRewardRoutes(apiRoutes, options.reward);
  registerContentRoutes(apiRoutes);
  registerSubscriptionRoutes(apiRoutes);

  apiRoutes.post('/events/track', async (c) => {
    const body = validateTrackEventBody(await c.req.json());
    await c.env.DB
      .prepare(
        `INSERT INTO user_events (id, user_id, event_type, meta, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        c.get('auth').userId,
        body.event_type,
        JSON.stringify(body.meta ?? {}),
        new Date().toISOString()
      )
      .run();
    return c.json({ ok: true });
  });

  apiAdminRoutes.use('*', adminSecretMiddleware);
  registerContentAdminRoutes(apiAdminRoutes);
  registerNotificationRoutes(apiAdminRoutes);
  registerSubscriptionAdminRoutes(apiAdminRoutes);

  app.route('/api/v1', apiRoutes);
  app.route('/api/v1', apiAdminRoutes);

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: handleCron
};
