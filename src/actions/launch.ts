import type { LaunchResponse } from '../client';
import { findAddresses, messageText, pickAddress } from '../extract';
import { formatLaunch } from '../format';
import { makeAction } from './common';

export const launchAction = makeAction<LaunchResponse>({
  name: 'PUMPDATA_LAUNCH',
  similes: ['PUMP_FUN_LAUNCH_RECORD', 'LAUNCH_RECORD', 'CHECK_PUMP_FUN_COIN'],
  description:
    "$0.005 USDC over x402. A pump.fun launch's record by mint: the deployer's launches and graduations, the buyers in the first 10 s and their share of supply, the insiders' share, curve progress, and how launches that looked the same at this age went over the next 24 h. Needs a mint address (options.mint or in the message).",
  label: 'GET /launch/{mint}',
  validate: (message) => findAddresses(messageText(message)).length > 0,
  run: async (client, message, options) => {
    const mint = pickAddress(message, options, 'mint');
    if (!mint) return { missing: 'Which coin? Give its mint address.' };
    return client.launch(mint);
  },
  format: formatLaunch,
  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: "What's the record behind 4dWxFoSwJ1HJTsrcR9i1mmBmGg4Q1kyKgrwy3ZT5pump?" },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Pulling its launch record from pumpdata.fun ($0.005).',
          actions: ['PUMPDATA_LAUNCH'],
        },
      },
    ],
  ],
});
