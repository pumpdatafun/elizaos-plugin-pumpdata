import type { SimilarResponse } from '../client';
import { findAddresses, messageText, pickAddress } from '../extract';
import { formatSimilar } from '../format';
import { makeAction } from './common';

export const similarAction = makeAction<SimilarResponse>({
  name: 'PUMPDATA_SIMILAR',
  similes: ['PUMP_FUN_SIMILAR_LAUNCHES', 'SIMILAR_LAUNCHES', 'COMPARABLE_LAUNCHES'],
  description:
    "$0.005 USDC over x402. The pump.fun launches most like this one at the same age, named by mint (the same deployer's prior launches first), and how each went over its next 24 h: peak, close, dead or graduated, with why each is similar. options.mint and optional options.limit (1 to 25), or a mint in the message.",
  label: 'GET /similar/{mint}',
  validate: (message) => findAddresses(messageText(message)).length > 0,
  run: async (client, message, options) => {
    const mint = pickAddress(message, options, 'mint');
    if (!mint) return { missing: 'Which coin? Give its mint address.' };
    const limit = typeof options?.limit === 'number' ? options.limit : undefined;
    return client.similar(mint, limit);
  },
  format: formatSimilar,
  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'How did launches like 4dWxFoSwJ1HJTsrcR9i1mmBmGg4Q1kyKgrwy3ZT5pump go?' },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Finding similar launches on pumpdata.fun ($0.005).',
          actions: ['PUMPDATA_SIMILAR'],
        },
      },
    ],
  ],
});
