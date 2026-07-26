import { pathToFileURL } from 'node:url';

export async function checkBackendRewardSsv({ baseUrl, fetcher = fetch }) {
  if (!baseUrl) throw new Error('BACKEND_BASE_URL is required.');
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/v1/rewards/ssv?preflight=invalid`;
  const response = await fetcher(endpoint, {
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Backend rewarded SSV preflight returned invalid JSON.');
  }
  if (response.status !== 400 || body?.error?.code !== 'MALFORMED_CALLBACK') {
    throw new Error(
      `Backend rewarded SSV preflight failed (${response.status}, ${body?.error?.code ?? 'unknown'}).`,
    );
  }
  return { endpoint, status: response.status, errorCode: body.error.code };
}

async function main() {
  const result = await checkBackendRewardSsv({ baseUrl: process.env.BACKEND_BASE_URL });
  console.log(JSON.stringify({
    rewardedSsvReady: true,
    status: result.status,
    errorCode: result.errorCode,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
