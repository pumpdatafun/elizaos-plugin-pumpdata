import { afterEach, describe, expect, it } from 'bun:test';
import {
  deployerAction,
  launchAction,
  similarAction,
  statsAction,
  walletsAction,
} from '../actions';
import { PumpdataClient } from '../client';
import { SERVICE_TYPE } from '../constants';
import { pumpdataPlugin } from '../plugin';
import { clearStatsCache, statsProvider } from '../providers/stats';
import { PumpdataService } from '../service';
import examples from './fixtures/examples.json';
import stats from './fixtures/stats.json';
import {
  BANNED,
  json,
  memory,
  offerWithAmount,
  res402,
  runtimeWith,
  scriptedFetch,
} from './helpers';

const MINT = 'D27Lb9LA6D4dFpogGoXMXvZYkRsZ7UuctxAFpFQ3pump';
const WALLET = '7ufmve7ZSFCzuNcKRunYrGtyb2Ka1MXzkWwf7jZhVsmL';

function runtimeFor(responses: Response[]) {
  const { fetch, calls } = scriptedFetch(responses);
  const service = new PumpdataService(undefined, new PumpdataClient({ fetch }));
  return { runtime: runtimeWith({}, { [SERVICE_TYPE]: service }), calls };
}

function expectClean(text: string) {
  for (const re of BANNED) expect(text).not.toMatch(re);
}

afterEach(() => clearStatsCache());

describe('plugin shape', () => {
  it('registers the service, five actions and the stats provider', () => {
    expect(pumpdataPlugin.name).toBe('pumpdata');
    expect(pumpdataPlugin.actions?.map((a) => a.name)).toEqual([
      'PUMPDATA_STATS',
      'PUMPDATA_LAUNCH',
      'PUMPDATA_WALLETS',
      'PUMPDATA_DEPLOYER',
      'PUMPDATA_SIMILAR',
    ]);
    expect(pumpdataPlugin.providers?.map((p) => p.name)).toEqual(['PUMPDATA_STATS']);
    expect(pumpdataPlugin.services).toContain(PumpdataService);
  });

  it('states the claim exactly, and nothing in the plugin text uses a banned word', () => {
    expect(pumpdataPlugin.description).toContain('Every pump.fun trade, ever.');
    expect(pumpdataPlugin.description).not.toMatch(/ever,|since/);
    const all = [
      pumpdataPlugin.description,
      ...(pumpdataPlugin.actions ?? []).map((a) => a.description),
    ].join('\n');
    expectClean(all);
  });
});

describe('validate', () => {
  it('paid actions need an address in the message; stats does not', async () => {
    const rt = runtimeWith();
    expect(await launchAction.validate(rt, memory('check this coin'))).toBe(false);
    expect(await launchAction.validate(rt, memory(`check ${MINT}`))).toBe(true);
    expect(await statsAction.validate(rt, memory('anything'))).toBe(true);
  });
});

describe('actions on 200', () => {
  it('PUMPDATA_STATS quotes the summary', async () => {
    const { runtime } = runtimeFor([json(200, stats)]);
    const r = await statsAction.handler(runtime, memory('pump.fun yesterday?'), undefined, {});
    expect(r?.success).toBe(true);
    expect(r?.text).toContain(stats.summary);
    expectClean(r!.text!);
  });

  it('PUMPDATA_STATS leaves out the summary when a check failed', async () => {
    const flagged = { ...stats, checks: { ok: false, failed: ['totals.volume_sol'], warned: [] } };
    const { runtime } = runtimeFor([json(200, flagged)]);
    const r = await statsAction.handler(runtime, memory('stats'), undefined, {});
    expect(r?.text).not.toContain(stats.summary);
    expect(r?.text).toContain('do not quote them: totals.volume_sol');
  });

  it('PUMPDATA_LAUNCH gives the record as numbers', async () => {
    const { runtime, calls } = runtimeFor([json(200, examples.launch)]);
    let said = '';
    const r = await launchAction.handler(
      runtime,
      memory(`what about ${MINT}`),
      undefined,
      {},
      async (c) => {
        said = c.text ?? '';
        return [];
      }
    );
    expect(calls[0].url).toBe(`https://pumpdata.fun/launch/${MINT}`);
    expect(r?.success).toBe(true);
    expect(said).toBe(r!.text!);
    expect(r?.text).toContain('14 launches, 1 graduations');
    expect(r?.text).toContain('6 buyers took 21% of supply');
    expect(r?.text).toContain('3,120 launches looked the same');
    expect(r?.text).toContain('not a prediction');
    expectClean(r!.text!);
  });

  it('PUMPDATA_WALLETS splits the mint from the wallets and explains each label as a rule', async () => {
    const body = {
      ...examples.wallets,
      [WALLET]: {
        class: 'bot',
        pnl_sol: -3.2,
        put_in: 10,
        took_out: 6.8,
        coins: 812,
        first_seen: '2025-05-01T00:00:00Z',
      },
    };
    const { runtime, calls } = runtimeFor([json(200, body)]);
    const r = await walletsAction.handler(
      runtime,
      memory(`buyers ${WALLET} of mint ${MINT}`),
      undefined,
      {}
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ addresses: [WALLET], mint: MINT });
    expect(r?.text).toContain('label "bot" (traded one coin 20+ times in a week, or 500+ coins)');
    expect(r?.text).toContain('not an opinion');
    expectClean(r!.text!);
  });

  it('PUMPDATA_WALLETS refuses more than 50 wallets without calling', async () => {
    const { runtime, calls } = runtimeFor([]);
    const addresses = Array.from({ length: 51 }, (_, i) => `${i}`.padStart(32, '1'));
    const r = await walletsAction.handler(runtime, memory('x'), undefined, { addresses });
    expect(r?.success).toBe(false);
    expect(r?.text).toContain('up to 50');
    expect(calls).toHaveLength(0);
  });

  it('PUMPDATA_DEPLOYER gives the 90-day counts and the base rate for its next launch', async () => {
    const { runtime } = runtimeFor([json(200, examples.deployer)]);
    const r = await deployerAction.handler(runtime, memory(`deployer ${WALLET}`), undefined, {});
    expect(r?.text).toContain('437 launches, 152 graduations (34.8%)');
    expect(r?.text).toContain('Last 90 days: 195 launches measured; 59 doubled (30.3%)');
    expect(r?.text).toContain('786,503 launches measured');
    expectClean(r!.text!);
  });

  it('PUMPDATA_SIMILAR names the comparables and how they went', async () => {
    const { runtime, calls } = runtimeFor([json(200, examples.similar)]);
    const r = await similarAction.handler(runtime, memory(`like ${MINT}`), undefined, { limit: 5 });
    expect(calls[0].url).toBe(`https://pumpdata.fun/similar/${MINT}?limit=5`);
    expect(r?.text).toContain('EpcTN22u5u5qVM4DXzwWy67NCzp7WNwyS1hVf49Dpump: next 24 h peak 7.24x');
    expectClean(r!.text!);
  });
});

describe('actions on 402', () => {
  it('without a wallet: says the price and that nothing was paid', async () => {
    const { runtime, calls } = runtimeFor([res402()]);
    const r = await launchAction.handler(runtime, memory(MINT), undefined, {});
    expect(r?.success).toBe(false);
    expect(r?.text).toContain('$0.005 USDC on Solana');
    expect(r?.text).toContain('nothing was paid');
    expect((r?.data as { outcome: string }).outcome).toBe('payment_required');
    expect(calls).toHaveLength(1);
  });

  it('wallets: $0.01', async () => {
    const { runtime } = runtimeFor([res402(offerWithAmount('10000'))]);
    const r = await walletsAction.handler(runtime, memory(WALLET), undefined, {});
    expect(r?.text).toContain('$0.01 USDC');
  });
});

describe('stats provider', () => {
  it('fetches once and serves the cached day after', async () => {
    const { runtime, calls } = runtimeFor([json(200, stats)]);
    const a = await statsProvider.get(runtime, memory('x'), {} as never);
    const b = await statsProvider.get(runtime, memory('y'), {} as never);
    expect(a.text).toContain(stats.summary);
    expect(b.values?.pumpfunLaunched).toBe(stats.totals.launched);
    expect(calls).toHaveLength(1);
  });

  it('is empty when the stats do not answer', async () => {
    const { runtime } = runtimeFor([json(503, { error: 'upstream_unreachable' })]);
    const r = await statsProvider.get(runtime, memory('x'), {} as never);
    expect(r.text).toBe('');
  });
});

describe('service start', () => {
  it('starts without a wallet and leaves paid calls unpaid', async () => {
    const service = await PumpdataService.start(runtimeWith({ PUMPDATA_MAX_PRICE_USD: '0.005' }));
    expect(service.client.canPay).toBe(false);
    expect(service.client.maxPriceUsd).toBe(0.005);
  });
});
