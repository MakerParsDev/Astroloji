import type { AppMiddleware } from '@/types';

function resolveAllowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export const corsMiddleware: AppMiddleware = async (c, next) => {
  const requestOrigin = c.req.header('origin');
  const allowedOrigins = resolveAllowedOrigins(c.env.ALLOWED_ORIGINS);

  // Only allow known origins; no Origin header = mobile/server request, skip CORS headers
  const matchedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : null;

  if (matchedOrigin) {
    c.header('Access-Control-Allow-Origin', matchedOrigin);
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Admin-Secret, X-Play-Secret, X-Cache-Bypass');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  await next();
};
