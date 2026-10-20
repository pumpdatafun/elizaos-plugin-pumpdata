import { describe, expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { getBase58Decoder } from '@solana/kit';
import { createX402Payer, decodeSecretKey, signerFromSecret } from '../x402';
import { offerWithAmount } from './helpers';

/** A throwaway ed25519 key made for this test run: never funded, never used on chain. */
function throwawaySecret(): Uint8Array {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const d = Buffer.from(privateKey.export({ format: 'jwk' }).d!, 'base64url');
  const x = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url');
  return new Uint8Array([...d, ...x]);
}

describe('wallet settings', () => {
  it('decodes a base58 secret key, as @elizaos/plugin-solana does', () => {
    const bytes = throwawaySecret();
    const b58 = getBase58Decoder().decode(bytes);
    expect(decodeSecretKey(b58)).toEqual(bytes);
  });

  it('decodes a base64 secret key', () => {
    const bytes = throwawaySecret();
    expect(decodeSecretKey(Buffer.from(bytes).toString('base64'))).toEqual(bytes);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => decodeSecretKey('abc')).toThrow();
  });

  it('builds a signer whose address matches the key', async () => {
    const bytes = throwawaySecret();
    const signer = await signerFromSecret(getBase58Decoder().decode(bytes));
    expect(signer.address).toBe(getBase58Decoder().decode(bytes.slice(32)));
  });
});

describe('x402 payer (reference client)', () => {
  it("refuses an offer above the cap in the x402 client's own spend controls, before any RPC", async () => {
    const signer = await signerFromSecret(getBase58Decoder().decode(throwawaySecret()));
    // An RPC URL that cannot answer: if the client tried to build a transaction it would fail differently.
    const payer = createX402Payer(signer, { maxPriceUsd: 0.01, rpcUrl: 'http://127.0.0.1:9' });
    expect(payer.address).toBe(signer.address);
    const err = await payer.createPaymentHeaders(offerWithAmount('2000000')).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('spendControls.maxAmountPerPayment');
  });
});
