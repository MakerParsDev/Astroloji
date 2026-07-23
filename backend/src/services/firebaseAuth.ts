import type { Env } from '@/types';
import { createGoogleAccessToken } from '@/utils/jwt';

const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

export class FirebaseAccountDeletionError extends Error {
  constructor(public readonly status: number) {
    super(`Firebase account deletion failed with ${status}.`);
    this.name = 'FirebaseAccountDeletionError';
  }
}

export function isFirebaseAccountDeletionError(
  error: unknown
): error is FirebaseAccountDeletionError {
  return error instanceof FirebaseAccountDeletionError ||
    (error instanceof Error && error.name === 'FirebaseAccountDeletionError');
}

function getFirebaseProjectId(env: Env): string {
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as { project_id?: string };
  if (!account.project_id) {
    throw new Error('Firebase service account JSON is missing project_id.');
  }
  return account.project_id;
}

function isUserNotFound(payload: unknown): boolean {
  return JSON.stringify(payload).includes('USER_NOT_FOUND');
}

export async function deleteFirebaseUser(env: Env, firebaseUid: string): Promise<void> {
  const projectId = getFirebaseProjectId(env);
  const accessToken = await createGoogleAccessToken(
    env.FIREBASE_SERVICE_ACCOUNT_JSON,
    FIREBASE_AUTH_SCOPE
  );
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:delete`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ localId: firebaseUid })
    }
  );

  if (response.ok) {
    return;
  }

  const payload = await response.json().catch(() => ({}));
  if (isUserNotFound(payload)) {
    return;
  }

  throw new FirebaseAccountDeletionError(response.status);
}
