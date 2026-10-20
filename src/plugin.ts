import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { deployerAction, launchAction, similarAction, statsAction, walletsAction } from './actions';
import { configSchema } from './environment';
import { statsProvider } from './providers/stats';
import { PumpdataService } from './service';

export const pumpdataPlugin: Plugin = {
  name: 'pumpdata',
  description:
    "pump.fun history from pumpdata.fun. Every pump.fun trade, ever. Free daily stats; launch, deployer, similar-launch and wallet records paid per call in USDC over x402 on Solana with the agent's wallet.",
  config: {
    PUMPDATA_BASE_URL: process.env.PUMPDATA_BASE_URL,
    PUMPDATA_MAX_PRICE_USD: process.env.PUMPDATA_MAX_PRICE_USD,
    PUMPDATA_API_KEY: process.env.PUMPDATA_API_KEY,
  },
  async init(config: Record<string, string>) {
    try {
      configSchema.partial().parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const msg = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new Error(`Invalid pumpdata plugin configuration: ${msg}`);
      }
      throw error;
    }
    logger.debug('pumpdata plugin initialized');
  },
  services: [PumpdataService],
  actions: [statsAction, launchAction, walletsAction, deployerAction, similarAction],
  providers: [statsProvider],
};

export default pumpdataPlugin;
