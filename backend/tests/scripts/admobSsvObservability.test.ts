import { describe, expect, it, vi } from 'vitest';

import {
  buildWorkerSsvDiagnosticQueries,
  buildWorkerSsvTelemetryQuery,
  executeWorkerSsvInspection,
  parseWorkerSsvTelemetry
} from '../../scripts/inspect-admob-ssv-results';

const workerName = 'astrology-ssv-transition';

function telemetry(events: unknown[], count = events.length) {
  return { events: { count, events } };
}

describe('AdMob SSV observability inspection', () => {
  it('builds bounded alternate filter and unfiltered diagnostic queries', () => {
    expect(buildWorkerSsvDiagnosticQueries(workerName, 15, 1, 1_800_000_000_000)).toEqual({
      scriptFilter: {
        queryId: 'astrology-worker-ssv-script-filter-diagnostic',
        timeframe: { from: 1_799_999_100_000, to: 1_800_000_000_000 },
        dry: true,
        limit: 1,
        parameters: {
          datasets: ['cloudflare-workers'],
          filterCombination: 'and',
          filters: [{ key: '$workers.scriptName', operation: 'eq', type: 'string', value: workerName }],
          view: 'events'
        }
      },
      unfiltered: {
        queryId: 'astrology-worker-ssv-unfiltered-diagnostic',
        timeframe: { from: 1_799_999_100_000, to: 1_800_000_000_000 },
        dry: true,
        limit: 1,
        parameters: {
          datasets: ['cloudflare-workers'],
          filterCombination: 'and',
          filters: [],
          view: 'events'
        }
      }
    });
  });

  it('builds a bounded Worker service telemetry query', () => {
    expect(buildWorkerSsvTelemetryQuery(workerName, 360, 20, 1_800_000_000_000)).toEqual({
      queryId: 'astrology-worker-ssv-results',
      timeframe: { from: 1_799_978_400_000, to: 1_800_000_000_000 },
      dry: true,
      limit: 20,
      parameters: {
        datasets: ['cloudflare-workers'],
        filterCombination: 'and',
        filters: [
          {
            key: '$metadata.service',
            operation: 'eq',
            type: 'string',
            value: workerName
          }
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

  it('preserves the allowlisted verification conflict outcome', () => {
    expect(
      parseWorkerSsvTelemetry(
        telemetry([
          {
            timestamp: Date.parse('2026-07-27T16:30:00.000Z'),
            $metadata: { service: workerName },
            source: { event: 'reward_ssv_result', outcome: 'verification_conflict' },
            $workers: {
              scriptName: workerName,
              scriptVersion: { id: '22222222-2222-4222-8222-222222222222' }
            }
          }
        ]),
        workerName,
        20
      )
    ).toEqual({
      operation: 'callback',
      status: 'found',
      timestamp: '2026-07-27T16:30:00.000Z',
      scriptName: workerName,
      outcome: 'verification_conflict',
      verifierCode: null,
      scriptVersion: '22222222-2222-4222-8222-222222222222'
    });
  });

  it('parses a JSON-string source and preserves only allowlisted evidence', () => {
    const parsed = parseWorkerSsvTelemetry(
      telemetry([
        {
          timestamp: Date.parse('2026-07-27T23:22:00.000Z'),
          source: JSON.stringify({
            event: 'reward_ssv_result',
            outcome: 'signature_rejected',
            verifierCode: 'MALFORMED_CALLBACK',
            url: 'https://example.invalid/?signature=secret',
            requestId: 'secret-request',
            userId: 'secret-user',
            customData: 'secret-custom'
          }),
          $workers: {
            scriptName: workerName,
            scriptVersion: { id: '33333333-3333-4333-8333-333333333333' }
          }
        }
      ]),
      workerName,
      20
    );

    expect(parsed).toEqual({
      operation: 'callback',
      status: 'found',
      timestamp: '2026-07-27T23:22:00.000Z',
      scriptName: workerName,
      outcome: 'signature_rejected',
      verifierCode: 'MALFORMED_CALLBACK',
      scriptVersion: '33333333-3333-4333-8333-333333333333'
    });
    const serialized = JSON.stringify(parsed);
    for (const forbidden of ['signature=secret', 'secret-request', 'secret-user', 'secret-custom']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('queries Cloudflare with scoped credentials and logs redacted evidence only', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              ...telemetry([], 0),
              run: { status: 'COMPLETED' },
              statistics: { rows_read: 42 }
            },
            errors: []
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                dataset: 'cloudflare-workers',
                key: '$metadata.service',
                type: 'string',
                value: workerName
              }
            ],
            errors: []
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              ...telemetry([{}], 1),
              run: { status: 'COMPLETED' },
              statistics: { rows_read: 7 }
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              ...telemetry([{}], 1),
              run: { status: 'COMPLETED' },
              statistics: { rows_read: 9 }
            }
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
      scriptVersion: null,
      telemetryCount: 0,
      returnedCount: 0,
      workerServiceSeen: true,
      queryStatus: 'COMPLETED',
      rowsRead: 42,
      scriptFilterReturnedCount: 1,
      scriptFilterQueryStatus: 'COMPLETED',
      scriptFilterRowsRead: 7,
      scriptFilterRequestStatus: 'ok',
      unfilteredReturnedCount: 1,
      unfilteredQueryStatus: 'COMPLETED',
      unfilteredRowsRead: 9,
      unfilteredRequestStatus: 'ok'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
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
    expect(JSON.parse(String(init.body))).toMatchObject({
      parameters: {
        filters: [
          {
            key: '$metadata.service',
            operation: 'eq',
            type: 'string',
            value: workerName
          }
        ]
      }
    });

    const [valuesUrl, valuesInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(valuesUrl).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-id/workers/observability/telemetry/values'
    );
    expect(JSON.parse(String(valuesInit.body))).toEqual({
      datasets: ['cloudflare-workers'],
      key: '$metadata.service',
      timeframe: { from: 1_799_978_400_000, to: 1_800_000_000_000 },
      type: 'string'
    });
    expect(valuesInit.signal).toBeInstanceOf(AbortSignal);
    expect(valuesInit.signal?.aborted).toBe(false);

    const [, scriptFilterInit] = fetchImpl.mock.calls[2] as [string, RequestInit];
    expect(JSON.parse(String(scriptFilterInit.body))).toMatchObject({
      timeframe: { from: 1_799_999_100_000, to: 1_800_000_000_000 },
      limit: 1,
      parameters: {
        filters: [{ key: '$workers.scriptName', value: workerName }]
      }
    });
    const [, unfilteredInit] = fetchImpl.mock.calls[3] as [string, RequestInit];
    expect(JSON.parse(String(unfilteredInit.body))).toMatchObject({
      timeframe: { from: 1_799_999_100_000, to: 1_800_000_000_000 },
      limit: 1,
      parameters: { filters: [] }
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('cf-secret-token');
  });


  it.each([
    {
      label: 'network failure',
      secondResponse: () => Promise.reject(new Error('values socket closed'))
    },
    {
      label: 'invalid JSON',
      secondResponse: () =>
        Promise.resolve(
          new Response('<html>bad gateway</html>', {
            status: 502,
            headers: { 'content-type': 'text/html' }
          })
        )
    },
    {
      label: 'unsuccessful payload',
      secondResponse: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ success: false, errors: [{ message: 'values denied' }] }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' }
            }
          )
        )
    }
  ])('keeps primary evidence when the values lookup has a $label', async ({ secondResponse }) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: telemetry([], 0),
            errors: []
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockImplementationOnce(secondResponse);
    const log = vi.fn();

    await expect(
      executeWorkerSsvInspection({
        env: {
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          SSV_WORKER_NAME: workerName
        },
        fetchImpl,
        nowMs: 1_800_000_000_000,
        log
      })
    ).resolves.toEqual({
      operation: 'callback',
      status: 'no_events',
      timestamp: null,
      scriptName: workerName,
      outcome: null,
      verifierCode: null,
      scriptVersion: null,
      telemetryCount: 0,
      returnedCount: 0,
      workerServiceSeen: null,
      queryStatus: null,
      rowsRead: null,
      scriptFilterReturnedCount: null,
      scriptFilterQueryStatus: null,
      scriptFilterRowsRead: null,
      scriptFilterRequestStatus: 'request_error',
      unfilteredReturnedCount: null,
      unfilteredQueryStatus: null,
      unfilteredRowsRead: null,
      unfilteredRequestStatus: 'request_error'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(log.mock.calls)).not.toContain('values socket closed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('values denied');
    expect(JSON.stringify(log.mock.calls)).not.toContain('bad gateway');
  });

  it('classifies diagnostic HTTP and API failures without exposing response details', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: telemetry([], 0) }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response('diagnostic upstream secret', { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, errors: [{ message: 'diagnostic denied secret' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    const log = vi.fn();

    const evidence = await executeWorkerSsvInspection({
      env: {
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        SSV_WORKER_NAME: workerName
      },
      fetchImpl,
      nowMs: 1_800_000_000_000,
      log
    });

    expect(evidence.scriptFilterRequestStatus).toBe('http_error');
    expect(evidence.unfilteredRequestStatus).toBe('api_error');
    expect(evidence.scriptFilterReturnedCount).toBeNull();
    expect(evidence.unfilteredReturnedCount).toBeNull();
    const serialized = JSON.stringify({ evidence, log: log.mock.calls });
    expect(serialized).not.toContain('diagnostic upstream secret');
    expect(serialized).not.toContain('diagnostic denied secret');
  });

  it('classifies diagnostic JSON and request failures without exposing exception details', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: telemetry([], 0) }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response('<html>diagnostic private body</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      )
      .mockRejectedValueOnce(new Error('diagnostic socket private detail'));
    const log = vi.fn();

    const evidence = await executeWorkerSsvInspection({
      env: {
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        SSV_WORKER_NAME: workerName
      },
      fetchImpl,
      nowMs: 1_800_000_000_000,
      log
    });

    expect(evidence.scriptFilterRequestStatus).toBe('invalid_json');
    expect(evidence.unfilteredRequestStatus).toBe('request_error');
    const serialized = JSON.stringify({ evidence, log: log.mock.calls });
    expect(serialized).not.toContain('diagnostic private body');
    expect(serialized).not.toContain('diagnostic socket private detail');
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
