import { Hono } from 'hono';

import { getCreditBalance, grantCreditsForPurchase, spendCredits } from '@/services/credits';
import { consumeProductPurchase, isConsumableProductPurchaseValid, verifyProductPurchase } from '@/services/playBilling';
import { enforceStrictRateLimit, mapStrictRateLimitResult } from '@/services/rateLimit';
import type { AppBindings } from '@/types';
import { validateCreditsSpendBody, validateCreditsVerifyBody } from '@/utils/validators';

const VERIFY_RATE_LIMIT = 5;
const VERIFY_RATE_WINDOW_SECONDS = 60;
const SPEND_RATE_LIMIT = 30;
const SPEND_RATE_WINDOW_SECONDS = 60;

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export function registerCreditsRoutes(app: Hono<AppBindings>): void {
  app.get('/credits/balance', async (c) => {
    const userId = c.get('auth').userId;
    const balance = await getCreditBalance(c.env.DB, userId);
    return c.json({ balance });
  });

  app.post('/credits/verify', async (c) => {
    const userId = c.get('auth').userId;
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'credits-verify', userId, VERIFY_RATE_LIMIT, VERIFY_RATE_WINDOW_SECONDS)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const body = validateCreditsVerifyBody(await c.req.json());
    const purchase = await verifyProductPurchase(c.env, body.purchase_token, body.product_id, c.env.PACKAGE_NAME);
    if (!purchase || !isConsumableProductPurchaseValid(purchase)) {
      return jsonError(400, 'INVALID_PURCHASE', 'Purchase token could not be verified.');
    }

    const result = await grantCreditsForPurchase(c.env.DB, {
      id: crypto.randomUUID(),
      userId,
      purchaseToken: body.purchase_token,
      productId: body.product_id,
      createdAt: new Date().toISOString()
    });

    if (result.status === 'conflict') {
      return jsonError(409, 'PURCHASE_TOKEN_CONFLICT', 'Purchase token belongs to another user.');
    }

    await consumeProductPurchase(c.env, body.purchase_token, body.product_id, c.env.PACKAGE_NAME);

    return c.json({
      ok: true,
      duplicate: result.status === 'duplicate',
      credits_granted: result.status === 'granted' ? result.creditsGranted : 0,
      balance: result.balance
    });
  });

  app.post('/credits/spend', async (c) => {
    const userId = c.get('auth').userId;
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'credits-spend', userId, SPEND_RATE_LIMIT, SPEND_RATE_WINDOW_SECONDS)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const body = validateCreditsSpendBody(await c.req.json());
    const result = await spendCredits(c.env.DB, {
      id: crypto.randomUUID(),
      userId,
      amount: body.amount,
      feature: body.feature,
      createdAt: new Date().toISOString()
    });

    if (result.status === 'insufficient_balance') {
      return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits for this action.');
    }

    return c.json({ ok: true, balance: result.balance });
  });
}
