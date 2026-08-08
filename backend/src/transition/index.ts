import { Hono } from 'hono';
import { ZodError } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/auth';
import type { TransitionBindings, TransitionEnv } from '@/types';
import {
  type RewardRouteDependencies,
  registerRewardRoutes
} from '@/workers/reward';
import { classifyRewardRequest } from '@/transition/rewardTransition';

export interface RewardTransitionWorker {
  fetch(
    request: Request,
    env: TransitionEnv,
    context: ExecutionContext
  ): Promise<Response>;
}

export interface TransitionWorkerOptions {
  nowMs?: () => number;
  originFetcher?: (request: Request) => Promise<Response>;
  rewardDependencies?: RewardRouteDependencies;
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function createLocalRewardApp(
  rewardDependencies: RewardRouteDependencies = {}
): Hono<TransitionBindings> {
  const app = new Hono<TransitionBindings>();
  const routes = new Hono<TransitionBindings>();

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
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

  routes.use('/rewards/prepare', jwtAuthMiddleware);
  routes.use('/rewards/claim', jwtAuthMiddleware);
  registerRewardRoutes(routes, rewardDependencies);
  app.route('/api/v1', routes);

  return app;
}

export function createRewardTransitionWorker(
  options: TransitionWorkerOptions = {}
): RewardTransitionWorker {
  const nowMs = options.nowMs ?? Date.now;
  const originFetcher = options.originFetcher ?? ((request: Request) => fetch(request));
  const localApp = createLocalRewardApp({
    ...options.rewardDependencies,
    nowMs: options.rewardDependencies?.nowMs ?? nowMs
  });

  return {
    async fetch(request, env, context) {
      const decision = await classifyRewardRequest(
        request,
        nowMs(),
        env.LEGACY_REWARD_FORWARD_UNTIL
      );

      if (decision.kind === 'reject') {
        return decision.response;
      }
      if (decision.kind === 'local') {
        return localApp.fetch(request, env, context);
      }

      const bodyCopy = new Uint8Array(decision.body.byteLength);
      bodyCopy.set(decision.body);
      const forwarded = new Request(request, { body: bodyCopy.buffer });
      return originFetcher(forwarded);
    }
  };
}

export default createRewardTransitionWorker();
