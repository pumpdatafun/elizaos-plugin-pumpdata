/**
 * Live checks against https://pumpdata.fun. Run with `bun run test:live`.
 * The free /stats.json is read; each paid call is sent unpaid, to confirm the 402 and its price.
 * No wallet is configured here, so nothing is ever paid or signed.
 */
import { describe, expect, it } from 'bun:test';
import { PumpdataClient } from '../client';

const live = process.env.PUMPDATA_LIVE === '1';
const MINT = '4dWxFoSwJ1HJTsrcR9i1mmBmGg4Q1kyKgrwy3ZT5pump';
const WALLET = '7ufmve7ZSFCzuNcKRunYrGtyb2Ka1MXzkWwf7jZhVsmL';

describe.skipIf(!live)('pumpdata.fun live (unpaid)', () => {
  const client = new PumpdataClient();

  it('client has no payer', () => {
    expect(client.canPay).toBe(false);
  });

  it('GET /stats.json answers 200 for free', async () => {
    const r = await client.stats();
    console.log(
      `GET /stats.json -> ${r.status}, day ${r.data?.day}, launched ${r.data?.totals?.launched}`
    );
    expect(r.outcome).toBe('ok');
    expect(r.paid).toBe(false);
    expect(typeof r.data?.summary).toBe('string');
  });

  const paid: Array<[string, () => ReturnType<PumpdataClient['request']>, number]> = [
    ['GET /launch/{mint}', () => client.launch(MINT), 0.005],
    ['POST /wallets', () => client.wallets([WALLET]), 0.01],
    ['GET /deployer/{address}', () => client.deployer(WALLET), 0.005],
    ['GET /similar/{mint}', () => client.similar(MINT), 0.005],
    [
      'GET /baserate',
      () =>
        client.request(
          'GET',
          '/baserate?band=15k-28k&from=2026-10-16T00:00:00Z&to=2026-10-17T00:00:00Z&venue=any'
        ),
      0.005,
    ],
    [
      'POST /replay',
      () =>
        client.request('POST', '/replay', {
          picks: [{ mint: MINT, at: '2026-10-01T00:00:00Z', size_sol: 0.5 }],
        }),
      2,
    ],
  ];
  for (const [name, call, price] of paid) {
    it(`${name} answers 402 at $${price}`, async () => {
      const r = await call();
      console.log(
        `${name} -> ${r.status} ${r.outcome}, $${r.offer?.priceUsd} ${r.offer?.network} payTo ${r.offer?.payTo}`
      );
      expect(r.status).toBe(402);
      expect(r.outcome).toBe('payment_required');
      expect(r.offer?.priceUsd).toBe(price);
      expect(r.offer?.scheme).toBe('exact');
    });
  }
});
