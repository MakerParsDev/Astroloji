import type { Env, FcmBatchResult, NotificationTarget } from '@/types';
import { createGoogleAccessToken } from '@/utils/jwt';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const MAX_BATCH_SIZE = 500;

function getProjectId(env: Env): string {
  const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as { project_id?: string };
  if (!parsed.project_id) {
    throw new Error('Firebase service account JSON is missing project_id.');
  }
  return parsed.project_id;
}

function isUnregisteredTargetError(payload: unknown): boolean {
  const serialized = JSON.stringify(payload);
  return (
    serialized.includes('registration-token-not-registered') ||
    serialized.includes('UNREGISTERED') ||
    serialized.includes('FID_NOT_FOUND')
  );
}

async function removeTarget(env: Env, target: NotificationTarget): Promise<void> {
  await env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ? AND target_type = ?')
    .bind(target.value, target.type)
    .run();
}

function buildTargetPayload(target: NotificationTarget): { token: string } | { fid: string } {
  return target.type === 'fid' ? { fid: target.value } : { token: target.value };
}

async function fcmFetch(
  accessToken: string,
  projectId: string,
  env: Env,
  target: NotificationTarget,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          ...buildTargetPayload(target),
          notification: { title, body },
          data
        }
      })
    }
  );

  if (response.ok) {
    return true;
  }

  const errorPayload = await response.json().catch(() => ({}));
  if (isUnregisteredTargetError(errorPayload)) {
    await removeTarget(env, target);
  }
  return false;
}

export async function sendNotification(
  env: Env,
  target: NotificationTarget,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  const accessToken = await createGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_JSON, FCM_SCOPE);
  return fcmFetch(accessToken, getProjectId(env), env, target, title, body, data);
}

export async function sendBatchNotifications(
  env: Env,
  targets: NotificationTarget[],
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<FcmBatchResult> {
  const accessToken = await createGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_JSON, FCM_SCOPE);
  const projectId = getProjectId(env);
  const result: FcmBatchResult = {
    success: 0,
    failed: 0,
    failedTokens: []
  };

  for (let index = 0; index < targets.length; index += MAX_BATCH_SIZE) {
    const chunk = targets.slice(index, index + MAX_BATCH_SIZE);
    const responses = await Promise.all(
      chunk.map(async (target) => ({
        target,
        ok: await fcmFetch(accessToken, projectId, env, target, title, body, data)
      }))
    );

    for (const response of responses) {
      if (response.ok) {
        result.success += 1;
      } else {
        result.failed += 1;
        result.failedTokens.push(response.target.value);
      }
    }
  }

  return result;
}
