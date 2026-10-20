import { type IAgentRuntime, Service, logger } from '@elizaos/core';
import { PumpdataClient } from './client';
import { SERVICE_TYPE } from './constants';
import { readConfig } from './environment';
import { createX402Payer, signerFromSecret } from './x402';

/** Holds one PumpdataClient per agent, with the agent's wallet as the x402 payer when configured. */
export class PumpdataService extends Service {
  static override serviceType = SERVICE_TYPE;
  override capabilityDescription =
    'Reads pump.fun history from pumpdata.fun: free daily stats, and launch, deployer, similar-launch and wallet records paid per call in USDC over x402 on Solana.';

  client: PumpdataClient;

  constructor(runtime?: IAgentRuntime, client?: PumpdataClient) {
    super(runtime);
    this.client = client ?? new PumpdataClient();
  }

  static override async start(runtime: IAgentRuntime): Promise<PumpdataService> {
    const config = readConfig(runtime);
    let payer;
    if (config.SOLANA_PRIVATE_KEY) {
      try {
        const signer = await signerFromSecret(config.SOLANA_PRIVATE_KEY);
        payer = createX402Payer(signer, {
          maxPriceUsd: config.PUMPDATA_MAX_PRICE_USD,
          rpcUrl: config.SOLANA_RPC_URL,
        });
        logger.info(
          `pumpdata: paid calls pay from ${signer.address}, at most $${config.PUMPDATA_MAX_PRICE_USD} a call`
        );
      } catch (err) {
        logger.warn(
          `pumpdata: wallet not usable for x402 (${String(err)}); only free calls will answer`
        );
      }
    } else {
      logger.info(
        'pumpdata: no Solana wallet configured; paid calls return their x402 offer unpaid'
      );
    }
    const client = new PumpdataClient({
      baseUrl: config.PUMPDATA_BASE_URL,
      apiKey: config.PUMPDATA_API_KEY,
      maxPriceUsd: config.PUMPDATA_MAX_PRICE_USD,
      payer,
    });
    return new PumpdataService(runtime, client);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(SERVICE_TYPE);
    if (service) await service.stop();
  }

  override async stop(): Promise<void> {}
}

/** The agent's PumpdataService, or a plain unpaid client if the service is not running. */
export function getClient(runtime: IAgentRuntime): PumpdataClient {
  const service = runtime.getService<PumpdataService>(SERVICE_TYPE);
  if (service?.client) return service.client;
  const config = readConfig(runtime);
  return new PumpdataClient({
    baseUrl: config.PUMPDATA_BASE_URL,
    apiKey: config.PUMPDATA_API_KEY,
    maxPriceUsd: config.PUMPDATA_MAX_PRICE_USD,
  });
}
