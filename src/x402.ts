import { createKeyPairSignerFromBytes, getBase58Encoder, type KeyPairSigner } from '@solana/kit';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentRequired } from '@x402/core/types';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { SOLANA_MAINNET } from './constants';

/**
 * Turns a 402 offer into the headers of the paid retry (PAYMENT-SIGNATURE).
 * The plugin's client depends on this interface only, so tests can stand in a fake.
 */
export interface X402Payer {
  /** The paying wallet's address, for logs and answers. */
  readonly address: string;
  createPaymentHeaders(paymentRequired: PaymentRequired): Promise<Record<string, string>>;
}

/** Decodes a Solana secret key the way @elizaos/plugin-solana does: base58 first, then base64. */
export function decodeSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim();
  try {
    const bytes = new Uint8Array(getBase58Encoder().encode(trimmed));
    if (bytes.length === 64) return bytes;
  } catch {
    // not base58; try base64 below
  }
  const bytes = new Uint8Array(Buffer.from(trimmed, 'base64'));
  if (bytes.length === 64) return bytes;
  throw new Error('Invalid Solana secret key: expected 64 bytes in base58 or base64');
}

export async function signerFromSecret(secret: string): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(decodeSecretKey(secret));
}

export interface X402PayerOptions {
  /** Hard per-call cap in USD, enforced by the x402 client's spend controls as well as by ours. */
  maxPriceUsd: number;
  /** Solana RPC the payment transaction is built against (blockhash, mint lookups). */
  rpcUrl?: string;
}

/**
 * The x402 payer, built on the x402 Foundation's reference client (@x402/core + @x402/svm,
 * scheme "exact", x402 v2). It signs a USDC transfer with the agent's wallet; the server's
 * facilitator pays the network fee and settles it. Only Solana mainnet is registered.
 */
export function createX402Payer(signer: KeyPairSigner, options: X402PayerOptions): X402Payer {
  const client = new x402Client();
  client.register(SOLANA_MAINNET, new ExactSvmScheme(signer, { rpcUrl: options.rpcUrl }));
  client.setSpendControls({ maxAmountPerPayment: `$${options.maxPriceUsd}` });
  const http = new x402HTTPClient(client);
  return {
    address: signer.address,
    async createPaymentHeaders(paymentRequired) {
      const payload = await http.createPaymentPayload(paymentRequired);
      return http.encodePaymentSignatureHeader(payload);
    },
  };
}
