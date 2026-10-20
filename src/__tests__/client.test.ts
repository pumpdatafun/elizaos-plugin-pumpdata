import { describe, expect, it, mock } from 'bun:test';
import { PumpdataClient } from '../client';
import type { X402Payer } from '../x402';
import {
  header,
  json,
  offer402,
  offerWithAmount,
  receiptHeader,
  res402,
  scriptedFetch,
} from './helpers';

const MINT = 'D27Lb9LA6D4dFpogGoXMXvZYkRsZ7UuctxAFpFQ3pump';

function fakePayer(): X402Payer & { createPaymentHeaders: ReturnType<typeof mock> } {
  return {
    address: 'FakePayer11111111111111111111111111111111111',
    createPaymentHeaders: mock(async () => ({ 'PAYMENT-SIGNATURE': 'signed-payload' })),
  };
}

describe('PumpdataClient', () => {
  it('reads the free stats with one plain GET', async () => {
    const { fetch, calls } = scriptedFetch([
      json(200, { day: '2026-10-19', totals: { launched: 1 } }),
    ]);
    const r = await new PumpdataClient({ fetch }).stats();
    expect(r.outcome).toBe('ok');
    expect(r.paid).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://pumpdata.fun/stats.json');
    expect(header(calls[0], 'payment-signature')).toBeUndefined();
  });

  it('asks a past day at /stats/{day}.json', async () => {
    const { fetch, calls } = scriptedFetch([json(200, {})]);
    await new PumpdataClient({ fetch }).stats('2026-10-16');
    expect(calls[0].url).toBe('https://pumpdata.fun/stats/2026-10-16.json');
  });

  it('returns the 402 offer unpaid when no wallet is configured', async () => {
    const { fetch, calls } = scriptedFetch([res402()]);
    const r = await new PumpdataClient({ fetch }).launch(MINT);
    expect(r.outcome).toBe('payment_required');
    expect(r.status).toBe(402);
    expect(r.paid).toBe(false);
    expect(r.offer?.priceUsd).toBe(0.005);
    expect(r.offer?.amount).toBe('5000');
    expect(r.offer?.network).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    expect(r.offer?.asset).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(calls).toHaveLength(1);
  });

  it('reads the offer from the body when the PAYMENT-REQUIRED header is missing', async () => {
    const { fetch } = scriptedFetch([res402(offer402, false)]);
    const r = await new PumpdataClient({ fetch }).launch(MINT);
    expect(r.outcome).toBe('payment_required');
    expect(r.offer?.priceUsd).toBe(0.005);
  });

  it('pays the 402 with the wallet and retries once with PAYMENT-SIGNATURE', async () => {
    const payer = fakePayer();
    const { fetch, calls } = scriptedFetch([
      res402(),
      json(
        200,
        { mint: MINT },
        { 'payment-response': receiptHeader(), 'x-data-as-of': '2026-10-20T00:00:00Z' }
      ),
    ]);
    const r = await new PumpdataClient({ fetch, payer }).launch(MINT);
    expect(r.outcome).toBe('ok');
    expect(r.paid).toBe(true);
    expect(r.offer?.priceUsd).toBe(0.005);
    expect(r.dataAsOf).toBe('2026-10-20T00:00:00Z');
    expect((r.receipt as { success: boolean }).success).toBe(true);
    expect(calls).toHaveLength(2);
    expect(header(calls[0], 'payment-signature')).toBeUndefined();
    expect(header(calls[1], 'payment-signature')).toBe('signed-payload');
    expect(calls[1].url).toBe(calls[0].url);
    const passed = payer.createPaymentHeaders.mock.calls[0][0];
    expect(passed.accepts).toHaveLength(1);
    expect(passed.accepts[0].amount).toBe('5000');
  });

  it('sends the same POST body on the paid retry', async () => {
    const payer = fakePayer();
    const { fetch, calls } = scriptedFetch([res402(offerWithAmount('10000')), json(200, {})]);
    const r = await new PumpdataClient({ fetch, payer }).wallets(['a'.repeat(32)], MINT);
    expect(r.outcome).toBe('ok');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      addresses: ['a'.repeat(32)],
      mint: MINT,
    });
  });

  it('refuses an offer above the price cap and pays nothing', async () => {
    const payer = fakePayer();
    const { fetch, calls } = scriptedFetch([res402(offerWithAmount('2000000'))]);
    const r = await new PumpdataClient({ fetch, payer, maxPriceUsd: 0.01 }).launch(MINT);
    expect(r.outcome).toBe('price_refused');
    expect(r.offer?.priceUsd).toBe(2);
    expect(payer.createPaymentHeaders).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('refuses an offer that is not USDC on Solana mainnet', async () => {
    const payer = fakePayer();
    const { fetch } = scriptedFetch([res402(offerWithAmount('5000', { network: 'eip155:8453' }))]);
    const r = await new PumpdataClient({ fetch, payer }).launch(MINT);
    expect(r.outcome).toBe('price_refused');
    expect(payer.createPaymentHeaders).not.toHaveBeenCalled();
  });

  it('reports a refused payment when the paid retry comes back 402', async () => {
    const payer = fakePayer();
    const { fetch } = scriptedFetch([
      res402(),
      json(402, { error: 'payment_invalid', reason: 'insufficient_funds' }),
    ]);
    const r = await new PumpdataClient({ fetch, payer }).launch(MINT);
    expect(r.outcome).toBe('payment_rejected');
    expect(r.paid).toBe(false);
    expect(r.error).toContain('insufficient_funds');
  });

  it('does not retry when settlement is uncertain', async () => {
    const payer = fakePayer();
    const { fetch, calls } = scriptedFetch([
      res402(),
      json(503, { error: 'payment_settle_uncertain' }),
    ]);
    const r = await new PumpdataClient({ fetch, payer }).launch(MINT);
    expect(r.outcome).toBe('payment_uncertain');
    expect(calls).toHaveLength(2);
  });

  it('reports a local signing failure without sending anything', async () => {
    const payer = fakePayer();
    payer.createPaymentHeaders.mockImplementation(async () => {
      throw new Error('no USDC account');
    });
    const { fetch, calls } = scriptedFetch([res402()]);
    const r = await new PumpdataClient({ fetch, payer }).launch(MINT);
    expect(r.outcome).toBe('payment_failed');
    expect(r.error).toBe('no USDC account');
    expect(calls).toHaveLength(1);
  });

  it('maps 404, 400, 429 and 502', async () => {
    const { fetch } = scriptedFetch([
      json(404, { error: 'not_found' }),
      json(400, { error: 'bad band' }),
      json(429, { error: 'rate_limited' }, { 'retry-after': '60' }),
      json(502, { error: 'upstream_failed' }),
    ]);
    const c = new PumpdataClient({ fetch });
    expect((await c.launch(MINT)).outcome).toBe('not_found');
    expect((await c.launch(MINT)).outcome).toBe('bad_request');
    const limited = await c.launch(MINT);
    expect(limited.outcome).toBe('rate_limited');
    expect(limited.retryAfterS).toBe(60);
    expect((await c.launch(MINT)).outcome).toBe('upstream_error');
  });

  it('maps a network error to upstream_error', async () => {
    const { fetch } = scriptedFetch([new Error('ECONNRESET')]);
    const r = await new PumpdataClient({ fetch }).launch(MINT);
    expect(r.outcome).toBe('upstream_error');
    expect(r.status).toBe(0);
  });

  it('sends the free-tier key as x-api-key and reads the remaining count', async () => {
    const { fetch, calls } = scriptedFetch([json(200, {}, { 'x-ratelimit-remaining': '4' })]);
    const r = await new PumpdataClient({ fetch, apiKey: 'pdk_test' }).deployer('b'.repeat(32));
    expect(header(calls[0], 'x-api-key')).toBe('pdk_test');
    expect(r.rateLimitRemaining).toBe(4);
  });

  it('clamps /similar limit to 1..25 and honours a custom base URL', async () => {
    const { fetch, calls } = scriptedFetch([json(200, {}), json(200, {})]);
    const c = new PumpdataClient({ fetch, baseUrl: 'http://localhost:8787/' });
    await c.similar(MINT, 99);
    await c.similar(MINT, 0);
    expect(calls[0].url).toBe(`http://localhost:8787/similar/${MINT}?limit=25`);
    expect(calls[1].url).toBe(`http://localhost:8787/similar/${MINT}`);
  });
});
