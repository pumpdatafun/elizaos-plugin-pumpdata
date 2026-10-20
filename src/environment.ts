import type { IAgentRuntime } from '@elizaos/core';
import { z } from 'zod';
import { DEFAULT_BASE_URL, DEFAULT_MAX_PRICE_USD } from './constants';

export const configSchema = z.object({
  PUMPDATA_BASE_URL: z.string().url().default(DEFAULT_BASE_URL),
  PUMPDATA_MAX_PRICE_USD: z.coerce.number().nonnegative().default(DEFAULT_MAX_PRICE_USD),
  PUMPDATA_API_KEY: z.string().min(1).optional(),
  SOLANA_PRIVATE_KEY: z.string().min(1).optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
});

export type PumpdataConfig = z.infer<typeof configSchema>;

function setting(runtime: IAgentRuntime, key: string): string | undefined {
  const value = runtime.getSetting(key);
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

/**
 * Reads the plugin's settings from the agent, the way other Solana plugins do:
 * the wallet is SOLANA_PRIVATE_KEY, or WALLET_PRIVATE_KEY as a fallback.
 */
export function readConfig(runtime: IAgentRuntime): PumpdataConfig {
  return configSchema.parse({
    PUMPDATA_BASE_URL: setting(runtime, 'PUMPDATA_BASE_URL'),
    PUMPDATA_MAX_PRICE_USD: setting(runtime, 'PUMPDATA_MAX_PRICE_USD'),
    PUMPDATA_API_KEY: setting(runtime, 'PUMPDATA_API_KEY'),
    SOLANA_PRIVATE_KEY:
      setting(runtime, 'SOLANA_PRIVATE_KEY') ?? setting(runtime, 'WALLET_PRIVATE_KEY'),
    SOLANA_RPC_URL: setting(runtime, 'SOLANA_RPC_URL'),
  });
}
