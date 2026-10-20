export const DEFAULT_BASE_URL = 'https://pumpdata.fun';

/** CAIP-2 id of Solana mainnet, the network pumpdata.fun's x402 offers name. */
export const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

/** USDC on Solana mainnet (6 decimals). */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

/** The most one call may cost unless PUMPDATA_MAX_PRICE_USD says otherwise. */
export const DEFAULT_MAX_PRICE_USD = 0.01;

export const SERVICE_TYPE = 'pumpdata';

/** Published prices, USD per call. The 402 offer is what is actually charged. */
export const PRICES_USD = {
  launch: 0.005,
  wallets: 0.01,
  deployer: 0.005,
  similar: 0.005,
  baserate: 0.005,
  replay: 2,
  stats: 0,
} as const;

export const MAX_WALLETS_PER_CALL = 50;
