import type { WalletsResponse } from '../client';
import { MAX_WALLETS_PER_CALL } from '../constants';
import { findAddresses, messageText, pickWallets } from '../extract';
import { formatWallets } from '../format';
import { makeAction } from './common';

export const walletsAction = makeAction<WalletsResponse>({
  name: 'PUMPDATA_WALLETS',
  similes: ['PUMP_FUN_WALLET_RECORDS', 'WALLET_RECORDS', 'CHECK_BUYERS'],
  description:
    '$0.01 USDC over x402 for up to 50 wallets. What each wallet has done on pump.fun over the whole history: SOL put in, SOL taken out, pnl, coins traded, first seen, and its rule label (winner, bot, supply_seller, new, none). options.addresses (array) and optional options.mint (the coin they are buying), or addresses in the message.',
  label: 'POST /wallets',
  validate: (message) => findAddresses(messageText(message)).length > 0,
  run: async (client, message, options) => {
    const { addresses, mint } = pickWallets(message, options);
    if (!addresses.length) return { missing: 'Which wallets? Give up to 50 addresses.' };
    if (addresses.length > MAX_WALLETS_PER_CALL) {
      return {
        missing: `${addresses.length} wallets given; one call takes up to ${MAX_WALLETS_PER_CALL}. Split them.`,
      };
    }
    return client.wallets(addresses, mint);
  },
  format: formatWallets,
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What have these buyers done before? 7ufmve7ZSFCzuNcKRunYrGtyb2Ka1MXzkWwf7jZhVsmL 48Wd6T22ykm6UHbdH4chq1hy1etdfpYYvVujCgL7AgPA',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Reading their wallet records from pumpdata.fun ($0.01).',
          actions: ['PUMPDATA_WALLETS'],
        },
      },
    ],
  ],
});
