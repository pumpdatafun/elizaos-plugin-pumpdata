import type {
  CompareTo,
  DeployerResponse,
  LaunchResponse,
  OutcomeCounts,
  PumpdataResult,
  SimilarResponse,
  StatsResponse,
  WalletsResponse,
} from './client';

const nf = new Intl.NumberFormat('en-US');

export function n(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return Number.isInteger(x) ? nf.format(x) : nf.format(Number(x.toFixed(digits)));
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return `${Number((x * 100).toFixed(digits))}%`;
}

export function mult(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return `${Number(x.toFixed(2))}x`;
}

function usd(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return `$${nf.format(Math.round(x))}`;
}

function duration(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return 'n/a';
  if (s < 120) return `${Math.round(s)} s`;
  if (s < 7200) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Number((s / 3600).toFixed(1))} h`;
  return `${Number((s / 86400).toFixed(1))} days`;
}

/** The rule behind each wallet class, as pumpdata.fun defines it. Labels are rules, not opinions. */
export const WALLET_CLASS_RULES: Record<string, string> = {
  winner: 'took out more SOL than it put in over 20+ coin-weeks',
  bot: 'traded one coin 20+ times in a week, or 500+ coins',
  supply_seller: 'took out 1.5x what it put in, 100 SOL or more',
  new: 'no record before the mint given (or before today)',
  none: 'no rule fits',
};

function asOfLine(r: PumpdataResult): string {
  const parts: string[] = [];
  if (r.dataAsOf) parts.push(`data as of ${r.dataAsOf}`);
  if (r.paid && r.offer) parts.push(`paid $${r.offer.priceUsd} USDC`);
  if (r.rateLimitRemaining !== undefined)
    parts.push(`${r.rateLimitRemaining} free calls left this hour`);
  return parts.length ? `(${parts.join('; ')})` : '';
}

function compareLine(c: CompareTo | undefined): string | undefined {
  if (!c || c.crossed === undefined) return undefined;
  const r = c.reached ?? {};
  return (
    `For comparison, ${n(c.crossed)} coins first traded in the ${c.band} band from ${c.from} to ${c.to}` +
    ` (venue ${c.venue}): ${pct(r['2x'])} reached 2x, ${pct(r['5x'])} 5x, ${pct(r['10x'])} 10x,` +
    ` ${pct(r['20x'])} 20x within 3 h; median peak ${mult(c.median_peak)}.`
  );
}

function outcomeLine(label: string, o: OutcomeCounts | undefined): string | undefined {
  if (!o || o.launches_measured === undefined) return undefined;
  return (
    `${label}: ${n(o.launches_measured)} launches measured; ${n(o.doubled)} doubled (${pct(o.doubled_share)}),` +
    ` ${n(o.ten_x)} did 10x (${pct(o.ten_x_share)}), ${n(o.held_2x)} held 2x at the next day's close` +
    ` (${pct(o.held_2x_share)}), ${n(o.dead_next_day)} were dead the next day (${pct(o.dead_share)}).`
  );
}

export function formatLaunch(r: PumpdataResult<LaunchResponse>): string {
  const d = r.data!;
  const lines = [`Launch ${d.mint} ${asOfLine(r)}`.trim()];
  if (d.created) lines.push(`Created ${d.created} (${duration(d.age_s)} ago).`);
  if (d.deployer) {
    lines.push(
      `Deployer record: ${n(d.deployer.launches)} launches, ${n(d.deployer.graduations)} graduations, best peak ${mult(d.deployer.best_peak)}.`
    );
  }
  if (d.bundle_at_creation) {
    lines.push(
      `First 10 s: ${n(d.bundle_at_creation.buyers_first_10s)} buyers took ${pct(d.bundle_at_creation.supply_share)} of supply.`
    );
  }
  lines.push(
    `Insiders' share of supply: ${pct(d.insider_supply_share)}. Curve progress: ${pct(d.curve_progress)}.` +
      (d.migrated_at ? ` Migrated to PumpSwap at ${d.migrated_at}.` : '')
  );
  if (d.matches) {
    lines.push(
      `${n(d.matches.n)} launches looked the same at this age: ${pct(d.matches.graduated_share)} graduated;` +
        ` over the next 24 h their median peak was ${mult(d.matches.peak_day1?.p50)} and their median close` +
        ` ${mult(d.matches.close_day1?.p50)} of the market cap at this age. A spread of past outcomes, not a prediction.`
    );
  }
  const cmp = compareLine(d.compare_to);
  if (cmp) lines.push(cmp);
  return lines.join('\n');
}

export function formatWallets(r: PumpdataResult<WalletsResponse>): string {
  const d = r.data ?? {};
  const entries = Object.entries(d);
  const counts: Record<string, number> = {};
  for (const [, w] of entries) counts[w.class ?? 'none'] = (counts[w.class ?? 'none'] ?? 0) + 1;
  const lines = [`Wallet records for ${entries.length} wallets ${asOfLine(r)}`.trim()];
  lines.push(
    'Labels: ' +
      Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ') +
      '. Each label is a rule over the whole history, not an opinion.'
  );
  for (const [address, w] of entries) {
    const cls = w.class ?? 'none';
    lines.push(
      `- ${address}: label "${cls}" (${WALLET_CLASS_RULES[cls] ?? 'rule label'}); put in ${n(w.put_in)} SOL,` +
        ` took out ${n(w.took_out)} SOL, pnl ${n(w.pnl_sol)} SOL over ${n(w.coins)} coins;` +
        ` first seen ${w.first_seen ?? 'n/a'}.`
    );
  }
  return lines.join('\n');
}

export function formatDeployer(r: PumpdataResult<DeployerResponse>): string {
  const d = r.data!;
  const rec = d.record ?? {};
  const lines = [`Deployer ${d.address} ${asOfLine(r)}`.trim()];
  lines.push(
    `Record: ${n(rec.launches)} launches, ${n(rec.graduations)} graduations (${pct(rec.graduation_rate)}),` +
      ` best peak ${usd(rec.best_peak_usd)}, ${n(rec.launches_last_day)} launches in the last day,` +
      ` last launch ${rec.last_launch ?? 'n/a'}, gap before its last launch ${duration(rec.last_launch_gap_s)}.`
  );
  const l90 = outcomeLine('Last 90 days', d.last_90_days);
  if (l90) lines.push(l90);
  const next = outcomeLine(
    'Base rate for its next launch, from deployers with the same record',
    d.next_launch?.launches_like_it
  );
  if (next) lines.push(next);
  const recent = d.recent_launches ?? [];
  if (recent.length) {
    lines.push(`Newest launches (${recent.length}):`);
    for (const x of recent.slice(0, 10)) {
      lines.push(
        `- ${x.mint} created ${x.created ?? 'n/a'}: 24 h peak ${mult(x.peak_mult_24h)}, close ${mult(x.close_mult_24h)}` +
          `${x.graduated ? ', graduated' : ''}${x.dead_next_day ? ', dead the next day' : ''}.`
      );
    }
  }
  return lines.join('\n');
}

export function formatSimilar(r: PumpdataResult<SimilarResponse>): string {
  const d = r.data!;
  const comps = d.comparables ?? [];
  const lines = [
    `Launches most like ${d.mint} at ${duration(d.at_age_s)} of age ${asOfLine(r)}`.trim(),
  ];
  if (d.same_bucket_n !== undefined) lines.push(`${n(d.same_bucket_n)} launches share its bucket.`);
  for (const c of comps) {
    const nx = c.next_24h ?? {};
    lines.push(
      `- ${c.mint}${c.same_deployer ? ' (same deployer)' : ''}: next 24 h peak ${mult(nx.peak_mult)},` +
        ` close ${mult(nx.close_mult)}${nx.dead ? ', dead within 24 h' : ''}. Similar because: ${c.similar_because ?? 'n/a'}.`
    );
  }
  lines.push('What launches that looked like this did next, not a prediction.');
  return lines.join('\n');
}

export function statsChecksFlagged(d: StatsResponse): unknown[] {
  return [...(d.checks?.failed ?? []), ...(d.checks?.warned ?? [])];
}

export function formatStats(r: PumpdataResult<StatsResponse>): string {
  const d = r.data ?? {};
  const t = d.totals ?? {};
  const flagged = statsChecksFlagged(d);
  const lines = [
    `pump.fun on ${d.day ?? 'the last UTC day'} (UTC), from pumpdata.fun's free daily stats.`,
  ];
  if (!flagged.length && d.summary) {
    lines.push(d.summary);
  } else {
    lines.push(
      `${n(t.launched)} coins launched, ${n(t.graduated)} graduated (${pct(t.graduation_rate, 2)});` +
        ` ${n(t.volume_sol, 0)} SOL (${usd(t.volume_usd)}) traded in ${n(t.trades)} trades by ${n(t.traders)} traders.`
    );
  }
  if (flagged.length) {
    lines.push(
      `Sanity checks flagged ${flagged.length} number(s); do not quote them: ${flagged
        .map((f) => (typeof f === 'string' ? f : JSON.stringify(f)))
        .join('; ')}.`
    );
  }
  return lines.join('\n');
}

/** Text for any outcome other than a 200, in plain terms: what happened and what was charged. */
export function formatNotOk(r: PumpdataResult, what: string): string {
  const offer = r.offer ? `$${r.offer.priceUsd} USDC on Solana` : 'a payment';
  switch (r.outcome) {
    case 'payment_required':
      return (
        `${what} costs ${offer} over x402. No Solana wallet is configured for this agent, so nothing was paid.` +
        ' Set SOLANA_PRIVATE_KEY (a wallet holding USDC) to pay per call, or PUMPDATA_API_KEY for the free tier.'
      );
    case 'price_refused':
      return `${what} was not paid: ${r.error ?? 'the offer was refused'}. Nothing was charged.`;
    case 'payment_rejected':
      return `${what}: the payment was refused by the server (${r.error ?? 'no reason given'}). Nothing settled.`;
    case 'payment_uncertain':
      return `${what}: the payment may or may not have settled (${r.error ?? 'no receipt'}). Not retrying, to avoid paying twice.`;
    case 'payment_failed':
      return `${what}: the payment could not be built or signed (${r.error ?? 'unknown error'}). Nothing was sent.`;
    case 'not_found':
      return `${what}: not found (${r.error ?? '404'}). A fresh launch may not be built yet; retry later. Nothing was charged.`;
    case 'bad_request':
      return `${what}: the request was malformed (${r.error ?? '400'}). Nothing was charged.`;
    case 'rate_limited':
      return `${what}: rate limited; retry after ${r.retryAfterS ?? 60} s.`;
    default:
      return `${what}: pumpdata.fun did not answer (status ${r.status}${r.error ? `, ${r.error}` : ''}).${r.paid ? '' : ' Nothing was charged.'}`;
  }
}
