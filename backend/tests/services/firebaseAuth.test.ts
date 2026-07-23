import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createGoogleAccessTokenMock } = vi.hoisted(() => ({
  createGoogleAccessTokenMock: vi.fn()
}));

vi.mock('@/utils/jwt', () => ({
  createGoogleAccessToken: createGoogleAccessTokenMock
}));

import { deleteFirebaseUser, FirebaseAccountDeletionError } from '@/services/firebaseAuth';
import { createTestEnv } from '../helpers/env';

describe('firebase auth account deletion', () => {
  beforeEach(() => {
    createGoogleAccessTokenMock.mockReset();
    createGoogleAccessTokenMock.mockResolvedValue('oauth-token');
    vi.unstubAllGlobals();
  });

  it('deletes the Firebase user with the Identity Toolkit admin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = createTestEnv();

    await deleteFirebaseUser(env, 'firebase-user-1');

    expect(createGoogleAccessTokenMock).toHaveBeenCalledWith(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      'https://www.googleapis.com/auth/identitytoolkit'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://identitytoolkit.googleapis.com/v1/projects/demo-project/accounts:delete'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      authorization: 'Bearer oauth-token',
      'content-type': 'application/json'
    });
    expect(JSON.parse(String(init.body))).toEqual({ localId: 'firebase-user-1' });
  });

  it('treats an already missing Firebase user as deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 400,
              message: 'USER_NOT_FOUND'
            }
          },
          { status: 400 }
        )
      )
    );

    await expect(deleteFirebaseUser(createTestEnv(), 'missing-user')).resolves.toBeUndefined();
  });

  it('throws a safe typed error for other upstream failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 403,
              message: 'PERMISSION_DENIED: internal details'
            }
          },
          { status: 403 }
        )
      )
    );

    await expect(deleteFirebaseUser(createTestEnv(), 'firebase-user-1')).rejects.toEqual(
      new FirebaseAccountDeletionError(403)
    );
  });
});
