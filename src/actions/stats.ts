import type { StatsResponse } from '../client';
import { formatStats } from '../format';
import { makeAction } from './common';

export const statsAction = makeAction<StatsResponse>({
  name: 'PUMPDATA_STATS',
  similes: ['PUMP_FUN_STATS', 'PUMPFUN_DAILY_STATS', 'PUMP_FUN_YESTERDAY'],
  description:
    'Free. Yesterday on pump.fun (one UTC day) from pumpdata.fun: coins launched and graduated, SOL and USD volume, trades, traders. Pass options.day as YYYY-MM-DD for a past day.',
  label: 'GET /stats.json',
  validate: () => true,
  run: (client, _message, options) => {
    const day =
      typeof options?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(options.day)
        ? options.day
        : undefined;
    return client.stats(day);
  },
  format: formatStats,
  examples: [
    [
      { name: '{{name1}}', content: { text: 'How many coins launched on pump.fun yesterday?' } },
      {
        name: '{{name2}}',
        content: {
          text: 'Reading the daily stats from pumpdata.fun.',
          actions: ['PUMPDATA_STATS'],
        },
      },
    ],
  ],
});
