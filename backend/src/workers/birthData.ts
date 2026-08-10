import type { Hono } from 'hono';

import { decryptBirthData, encryptBirthData, type BirthDataPlaintext } from '@/services/birthDataEncryption';
import { getCityById } from '@/services/cityLookup';
import type {
  AppBindings,
  BirthDataResponse,
  BirthTimeCertainty,
  Env,
  UserBirthDataRow
} from '@/types';
import { convertLocalWallClockToUtc } from '@/utils/timezone';
import { validateSaveBirthDataBody } from '@/utils/validators';

/** Applied when the user does not know their birth time — matches the placeholder pattern already used client-side in BirthProfileTimestamp.kt, but anchored to the birth city's local noon rather than UTC noon. `time_certainty` staying "unknown" is what actually keeps Moon/Ascendant/houses from being computed off of it (see ADR-0002); this value never claims precision it doesn't have. */
const UNKNOWN_BIRTH_LOCAL_TIME = '12:00:00';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export function registerBirthDataRoutes(app: Hono<AppBindings>) {
  app.put('/users/me/birth-data', async (c) => {
    const body = validateSaveBirthDataBody(await c.req.json());
    const userId = c.get('auth').userId;

    const city = getCityById(body.city_id);
    if (!city) {
      return jsonError(400, 'INVALID_REQUEST', 'city_id does not match a known city.');
    }

    const localTime = body.local_time ?? UNKNOWN_BIRTH_LOCAL_TIME;
    let utcInstant: Date;
    try {
      utcInstant = convertLocalWallClockToUtc({
        isoLocalDateTime: `${body.local_date}T${localTime}`,
        tzid: city.tzid
      });
    } catch {
      return jsonError(400, 'INVALID_REQUEST', 'local_date/local_time could not be resolved to a UTC instant.');
    }

    const plaintext: BirthDataPlaintext = {
      timestamp: utcInstant.toISOString(),
      latitude: city.latitude,
      longitude: city.longitude,
      tzid: city.tzid
    };
    const encrypted = await encryptBirthData(c.env, plaintext);

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO user_birth_data (user_id, time_certainty, encrypted_payload, encryption_iv, encryption_key_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         time_certainty = excluded.time_certainty,
         encrypted_payload = excluded.encrypted_payload,
         encryption_iv = excluded.encryption_iv,
         encryption_key_version = excluded.encryption_key_version,
         updated_at = excluded.updated_at`
    )
      .bind(userId, body.time_certainty, encrypted.ciphertext, encrypted.iv, encrypted.keyVersion, now, now)
      .run();

    return c.json<BirthDataResponse>({ time_certainty: body.time_certainty, has_birth_data: true });
  });

  app.get('/users/me/birth-data', async (c) => {
    const row = (await c.env.DB.prepare('SELECT time_certainty FROM user_birth_data WHERE user_id = ?')
      .bind(c.get('auth').userId)
      .first()) as Pick<UserBirthDataRow, 'time_certainty'> | null;

    if (!row) {
      return c.json<BirthDataResponse>({ time_certainty: 'unknown', has_birth_data: false });
    }
    return c.json<BirthDataResponse>({ time_certainty: row.time_certainty, has_birth_data: true });
  });

  app.delete('/users/me/birth-data', async (c) => {
    await c.env.DB.prepare('DELETE FROM user_birth_data WHERE user_id = ?').bind(c.get('auth').userId).run();
    return c.json({ ok: true });
  });
}

export interface DecryptedBirthData {
  plaintext: BirthDataPlaintext;
  timeCertainty: BirthTimeCertainty;
}

/**
 * Server-side-only read used by chart/content generation, never by an API
 * response — the public routes above intentionally return only
 * `time_certainty` / `has_birth_data`, not the decrypted location or
 * timestamp, to avoid re-exposing precise birth coordinates over the network
 * any more than necessary.
 */
export async function getDecryptedBirthData(
  env: Pick<Env, 'DB' | 'BIRTH_DATA_ENCRYPTION_KEY'>,
  userId: string
): Promise<DecryptedBirthData | null> {
  const row = (await env.DB.prepare('SELECT * FROM user_birth_data WHERE user_id = ?')
    .bind(userId)
    .first()) as UserBirthDataRow | null;
  if (!row) {
    return null;
  }

  const plaintext = await decryptBirthData(env, {
    ciphertext: row.encrypted_payload,
    iv: row.encryption_iv,
    keyVersion: row.encryption_key_version
  });

  return { plaintext, timeCertainty: row.time_certainty };
}
