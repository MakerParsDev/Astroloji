import { Hono } from 'hono';

import { sendBatchNotifications } from '@/services/fcm';
import type { AppBindings, NotificationTargetRow } from '@/types';
import { sanitizeNotificationData, validateNotificationBody } from '@/utils/validators';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

async function getTargets(
  db: D1Database,
  args: { userId?: string; sign?: string }
): Promise<NotificationTargetRow[]> {
  const clauses = ['f.notification_enabled = 1'];
  const bindings: Array<string> = [];

  if (args.userId) {
    clauses.push('u.id = ?');
    bindings.push(args.userId);
  }

  if (args.sign) {
    clauses.push('u.sign = ?');
    bindings.push(args.sign);
  }

  const result = await db
    .prepare(
      `SELECT u.id AS user_id, u.sign, u.language, u.utc_offset, f.token, f.notification_hour
       FROM users u
       INNER JOIN fcm_tokens f ON f.user_id = u.id
       WHERE ${clauses.join(' AND ')}`
    )
    .bind(...bindings)
    .all<NotificationTargetRow>();

  return result.results ?? [];
}

export function registerNotificationRoutes(app: Hono<AppBindings>) {
  app.post('/notifications/send', async (c) => {
    const body = validateNotificationBody(await c.req.json());
    const targets = await getTargets(c.env.DB, {
      userId: body.user_id,
      sign: body.sign
    });

    if (targets.length === 0) {
      return jsonError(404, 'NO_TOKENS_FOUND', 'No notification targets matched the request.');
    }

    const result = await sendBatchNotifications(
      c.env,
      targets.map((target) => target.token),
      body.title,
      body.body,
      sanitizeNotificationData(body.data)
    );

    return c.json(result);
  });
}
