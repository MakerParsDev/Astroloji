import { describe, expect, it, vi } from 'vitest';

import {
  buildWorkerSsvTelemetryQuery,
  executeWorkerSsvInspection,
  parseWorkerSsvTelemetry
} from '../../scripts/inspect-admob-ssv-results';

const workerName = 'astrology-ssv-transition';

function telemetry(events: unknown[]) {
  return { events: { events } };
}

describe('AdMob SSV observability inspection', () => {
  it('builds a bounded worker telemetry query', () => {
    expect(buildWorkerSsvTelemetryQuery(workerName, 360, 20, 1_800_000_000_000)).toEqual({
      queryId: 'astrology-worker-ssv-results',
      timeframe: { from: 1_799_978_400_000, to: 1_800_000_000_000 },
      dry: true,
      limit: 20,
      parameters: {
        datasets: ['cloudflare-workers'],
        filterCombination: 'and',
        filters: [
          { key: '$metadata.service', operation: 'eq', type: 'string', value: workerName }
        ],
        view: 'events'
      }
    });
  });

  it('returns only the latest allowlisted redacted event', () => {
    const parsed = parseWorkerSsvTelemetry(
      telemetry([
        {
          timestamp: Date.parse('2026-07-27T16:24:00.000Z'),
          $metadata: { service: workerName },
          source: {
            event: 'reward_ssv_result',
            outcome: 'signature_rejected',
            verifierCode: 'INVALID_SIGNATURE',
            url: 'https://example.invalid/?signature=secret',
            requestId: 'secret-request',
            userId: 'secret-user',
            customData: 'secret-custom'
          },
          $workers: {
            scriptName: workerName,
            scriptVersion: { id: '11111111-1111-4111-8111-111111111111' }
          }
        },
        {
          timestamp: Date.parse('2026-07-27T16:20:00.000Z'),
          $metadata: { service: workerName },
          source: { event: 'reward_ssv_result', outcome: 'verified', verifierCode: 'NOT_ALLOWED' },
          $workers: { scriptName: workerName }
        },
        {
          timestamp: Date.parse('2026-07-27T16:26:00.000Z'),
          $metadata: { service: workerName, message: 'Reward SSV result.' },
          source: { outcome: 'verified' },
          $workers: { scriptName: workerName }
        },
        {
          timestamp: Date.parse('2026-07-27T16:25:00.000Z'),
          $metadata: { service: 'other-worker' },
          source: { event: 'reward_ssv_result', outcome: 'verified' }
        }
      ]),
      workerName,
      20
    );

    expect(parsed).toEqual({
      operation: 'callback',
      status: 'found',
      timestamp: '2026-07-27T16:24:00.000Z',
      scriptName: workerName,
      outcome: 'signature_rejected',
      verifierCode: 'INVALID_SIGNATURE',
      scriptVersion: '11111111-1111-4111-8111-111111111111'
    });
    const serialized = JSON.stringify(parsed);
    for (const forbidden of ['signature=secret', 'secret-request', 'secret-user', 'secret-custom']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('queries Cloudflare with scoped credentials and logs redacted evidence only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: telemetry([]),
          errors: []
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const log = vi.fn();

    const evidence = await executeWorkerSsvInspection({
      env: {
        CLOUDFLARE_API_TOKEN: 'cf-secret-token',
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        SSV_WORKER_NAME: workerName
      },
      fetchImpl,
      nowMs: 1_800_000_000_000,
      log
    });

    expect(evidence).toEqual({
      operation: 'callback',
      status: 'no_events',
      timestamp: null,
      scriptName: workerName,
      outcome: null,
      verifierCode: null,
      scriptVersion: null
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-id/workers/observability/telemetry/query'
    );
    expect(init.headers).toEqual({
      Authorization: 'Bearer cf-secret-token',
      'Content-Type': 'application/json'
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('cf-secret-token');
  });


  it('normalizes network and non-JSON failures into the telemetry error context', async () => {
    const networkFailure = vi.fn().mockRejectedValue(new Error('socket closed'));
    await expect(
      executeWorkerSsvInspection({
        env: {
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          SSV_WORKER_NAME: workerName
        },
        fetchImpl: networkFailure
      })
    ).rejects.toThrow(/Cloudflare telemetry query failed/);

    const htmlFailure = vi.fn().mockResolvedValue(
      new Response('<html>upstream failure</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' }
      })
    );
    await expect(
      executeWorkerSsvInspection({
        env: {
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          SSV_WORKER_NAME: workerName
        },
        fetchImpl: htmlFailure
      })
    ).rejects.toThrow(/Cloudflare telemetry query failed/);
  });

  it('rejects invalid names, bounds, missing credentials, and Cloudflare failures', async () => {
    expect(() => buildWorkerSsvTelemetryQuery('../worker', 360, 20, 0)).toThrow(/Worker/);
    expect(() => buildWorkerSsvTelemetryQuery(workerName, 3610, 20, 0)).toThrow(/lookback/);
    expect(() => buildWorkerSsvTelemetryQuery(workerName, 360, 51, 0)).toThrow(/limit/);

    await expect(executeWorkerSsvInspection({ env: {} })).rejects.toThrow(
      /CLOUDFLARE_API_TOKEN/
    );

    const failedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ message: 'denied' }] }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(
      executeWorkerSsvInspection({
        env: {
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          SSV_WORKER_NAME: workerName
        },
        fetchImpl: failedFetch
      })
    ).rejects.toThrow(/Cloudflare telemetry query failed/);
  });
});
