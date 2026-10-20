import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from '@elizaos/core';
import type { PumpdataResult, StatsResponse } from '../client';
import { formatStats } from '../format';
import { getClient } from '../service';

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; baseUrl: string; result: PumpdataResult<StatsResponse> } | undefined;

/** Test hook: forget the cached day. */
export function clearStatsCache(): void {
  cache = undefined;
}

/**
 * Free context: the last UTC day on pump.fun from pumpdata.fun's /stats.json, fetched at most
 * once an hour. Gives the agent the day's launches, graduations and volume without a paid call.
 */
export const statsProvider: Provider = {
  name: 'PUMPDATA_STATS',
  description: "Yesterday on pump.fun (one UTC day) from pumpdata.fun's free daily stats",
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<ProviderResult> => {
    const client = getClient(runtime);
    const now = Date.now();
    if (!cache || cache.baseUrl !== client.baseUrl || now - cache.at > TTL_MS) {
      const result = await client.stats();
      if (result.outcome !== 'ok') return { text: '', values: {}, data: {} };
      cache = { at: now, baseUrl: client.baseUrl, result };
    }
    const d = cache.result.data ?? {};
    return {
      text: formatStats(cache.result),
      values: {
        pumpfunDay: d.day ?? '',
        pumpfunLaunched: d.totals?.launched ?? 0,
        pumpfunGraduated: d.totals?.graduated ?? 0,
      },
      data: { stats: d },
    };
  },
};
