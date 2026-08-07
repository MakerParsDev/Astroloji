import type { Env, GooglePlaySubscription, GooglePlaySubscriptionResponse, SubscriptionStatus } from '@/types';
import { createGoogleAccessToken } from '@/utils/jwt';

const GOOGLE_PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const GOOGLE_PLAY_REQUEST_TIMEOUT_MS = 15_000;

export function normalizeSubscriptionState(raw: string | undefined): SubscriptionStatus {
  switch (raw) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'active';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'grace_period';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'on_hold';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_CANCELED':
      return 'cancelled';
    case 'SUBSCRIPTION_STATE_EXPIRED':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
    case 'SUBSCRIPTION_STATE_REVOKED':
      return 'expired';
    default:
      return 'expired';
  }
}

export function hasPremiumEntitlement(
  subscription: Pick<GooglePlaySubscription, 'status' | 'expiresAt'>,
  now = new Date().toISOString()
): boolean {
  if (
    subscription.status === 'paused' ||
    subscription.status === 'on_hold' ||
    subscription.status === 'expired'
  ) {
    return false;
  }

  return subscription.expiresAt > now;
}

function normalizeSubscription(
  purchaseToken: string,
  productId: string,
  raw: GooglePlaySubscriptionResponse
): GooglePlaySubscription | null {
  const lineItem = raw.lineItems?.find((item) => item.productId === productId) ?? raw.lineItems?.[0];
  if (!lineItem?.expiryTime) {
    return null;
  }

  return {
    purchaseToken,
    productId: lineItem.productId ?? productId,
    status: normalizeSubscriptionState(raw.subscriptionState),
    startsAt: raw.startTime ?? new Date().toISOString(),
    expiresAt: lineItem.expiryTime,
    autoRenewing: Boolean(lineItem.autoRenewingPlan),
    cancelReason: raw.canceledStateContext?.cancellationReason ?? null,
    raw
  };
}

async function playFetch<T>(env: Env, url: string, init?: RequestInit): Promise<T> {
  const signal = init?.signal ?? AbortSignal.timeout(GOOGLE_PLAY_REQUEST_TIMEOUT_MS);
  const accessToken = await createGoogleAccessToken(
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_PLAY_SCOPE,
    signal
  );
  const response = await fetch(url, {
    ...init,
    signal,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null as T;
    }
    throw new Error(`Google Play API request failed with ${response.status}.`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export interface PlaySubscriptionRegionConfig {
  region_code: string;
  currency_code: string;
  price_micros: string;
}

export interface PlaySubscriptionPatchRequest {
  package_name?: string;
  regions: PlaySubscriptionRegionConfig[];
}

export async function listPlaySubscriptions(env: Env, packageName: string): Promise<unknown> {
  return playFetch(
    env,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/subscriptions`
  );
}

export async function patchPlaySubscription(
  env: Env,
  packageName: string,
  productId: string,
  payload: PlaySubscriptionPatchRequest
): Promise<unknown> {
  return playFetch(
    env,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/subscriptions/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        packageName,
        regionalConfigs: payload.regions.map((region) => ({
          regionCode: region.region_code,
          price: {
            currencyCode: region.currency_code,
            priceMicros: region.price_micros
          }
        }))
      })
    }
  );
}

export async function listPlayReviews(
  env: Env,
  packageName: string,
  maxResults = 20
): Promise<unknown> {
  return playFetch(
    env,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/reviews?maxResults=${maxResults}`
  );
}

export async function replyToPlayReview(
  env: Env,
  packageName: string,
  reviewId: string,
  replyText: string
): Promise<unknown> {
  return playFetch(
    env,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/reviews/${encodeURIComponent(reviewId)}:reply`,
    {
      method: 'POST',
      body: JSON.stringify({
        replyText
      })
    }
  );
}

export async function getSubscriptionStatus(
  env: Env,
  purchaseToken: string,
  productId: string,
  packageName: string
): Promise<GooglePlaySubscription | null> {
  const raw = await playFetch<GooglePlaySubscriptionResponse | null>(
    env,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
  );

  if (!raw) {
    return null;
  }

  return normalizeSubscription(purchaseToken, productId, raw);
}

export async function verifySubscriptionPurchase(
  env: Env,
  purchaseToken: string,
  productId: string,
  packageName: string
): Promise<GooglePlaySubscription | null> {
  return getSubscriptionStatus(env, purchaseToken, productId, packageName);
}

export async function cancelSubscription(
  env: Env,
  purchaseToken: string,
  _productId: string,
  packageName: string
): Promise<boolean> {
  await playFetch(
    env,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}:cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        cancellationContext: {
          cancellationType: 'USER_REQUESTED_STOP_RENEWALS'
        }
      })
    }
  );

  return true;
}
