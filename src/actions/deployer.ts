import type { DeployerResponse } from '../client';
import { findAddresses, messageText, pickAddress } from '../extract';
import { formatDeployer } from '../format';
import { makeAction } from './common';

export const deployerAction = makeAction<DeployerResponse>({
  name: 'PUMPDATA_DEPLOYER',
  similes: ['PUMP_FUN_DEPLOYER_RECORD', 'DEPLOYER_RECORD', 'DEV_RECORD'],
  description:
    "$0.005 USDC over x402. A pump.fun deployer's record by wallet address, no coin needed: launches, graduations, best run, the gap before its last launch; over the last 90 days how many of its launches doubled, did 10x, held 2x or were dead the next day; its newest launches; and the base rate for its next launch from deployers with the same record. options.address or an address in the message.",
  label: 'GET /deployer/{address}',
  validate: (message) => findAddresses(messageText(message)).length > 0,
  run: async (client, message, options) => {
    const address = pickAddress(message, options, 'address');
    if (!address) return { missing: 'Which deployer? Give its wallet address.' };
    return client.deployer(address);
  },
  format: formatDeployer,
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: "What's the record of deployer 7ufmve7ZSFCzuNcKRunYrGtyb2Ka1MXzkWwf7jZhVsmL?",
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "Reading the deployer's record from pumpdata.fun ($0.005).",
          actions: ['PUMPDATA_DEPLOYER'],
        },
      },
    ],
  ],
});
