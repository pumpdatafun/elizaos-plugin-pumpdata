/**
 * One real call to pumpdata.fun, paid over x402, to prove the payment path end to end: GET /deployer/{address}, $0.005
 * in USDC on Solana mainnet, signed by the wallet in SOLANA_PRIVATE_KEY (base58 or base64; never printed).
 *
 *   bun run scripts/paid-call.ts [deployer-address]              shows the price, pays nothing
 *   PUMPDATA_PAY=1 bun run scripts/paid-call.ts [address]        pays $0.005 once and prints the answer and the receipt
 * The wallet: SOLANA_KEYPAIR_PATH (a Solana keypair file, the JSON array solana-keygen writes; read here, never printed),
 * or SOLANA_PRIVATE_KEY (base58 or base64).
 *
 * The cap is $0.005: an offer above it is refused before anything is signed. Use a wallet with a little USDC; it needs no SOL (the facilitator pays the network fee).
 */
import { PumpdataClient } from '../src/client';
import { createX402Payer, signerFromSecret } from '../src/x402';

const MAX = 0.005;
const address = process.argv[2];
const pay = process.env.PUMPDATA_PAY === '1';
import { readFileSync } from 'node:fs';
/** the secret from a keypair file (64 bytes as a JSON array), as base64, else SOLANA_PRIVATE_KEY */
function readSecret(): string {
  const path = process.env.SOLANA_KEYPAIR_PATH;
  if (!path) return process.env.SOLANA_PRIVATE_KEY ?? '';
  const bytes = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(bytes) || bytes.length !== 64)
    throw new Error(`${path}: not a 64-byte Solana keypair file`);
  return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}
const secret = readSecret();

async function main(): Promise<void> {
  let target = address;
  if (!target) {
    // the day's best deployer from the free stats, so the call has a real wallet to ask about
    const stats = await new PumpdataClient().stats();
    target = (stats.data as any)?.launches?.best_deployers?.[0]?.address;
    if (!target) throw new Error('no deployer address given, and none in the free stats');
  }
  if (!pay) {
    const r = await new PumpdataClient({ maxPriceUsd: MAX }).deployer(target);
    console.log(
      `GET /deployer/${target} -> ${r.status} (${r.outcome}); offer: ${JSON.stringify(r.offer)}`
    );
    console.log(
      'nothing paid. To pay $0.005 once: PUMPDATA_PAY=1 SOLANA_PRIVATE_KEY=... bun run scripts/paid-call.ts'
    );
    return;
  }
  if (!secret)
    throw new Error(
      'PUMPDATA_PAY=1 needs SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY (a wallet with a little USDC)'
    );
  const signer = await signerFromSecret(secret);
  const client = new PumpdataClient({
    maxPriceUsd: MAX,
    payer: createX402Payer(signer, { maxPriceUsd: MAX, rpcUrl: process.env.SOLANA_RPC_URL }),
  });
  console.log(`paying from ${client.payerAddress}, at most $${MAX}`);
  const r = await client.deployer(target);
  console.log(
    `GET /deployer/${target} -> ${r.status} (${r.outcome}), paid: ${r.paid}${r.error ? `, error: ${r.error}` : ''}`
  );
  if (r.receipt) console.log('receipt:', JSON.stringify(r.receipt));
  if (r.data) console.log('answer:', JSON.stringify(r.data, null, 1).slice(0, 1500));
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
