import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from '@x402/core/http';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_PRICE_USD,
  SOLANA_MAINNET,
  USDC_DECIMALS,
  USDC_MINT,
} from './constants';
import type { X402Payer } from './x402';

/** What a 402 asks for, in plain terms. */
export interface PaymentOffer {
  priceUsd: number;
  amount: string;
  asset: string;
  network: string;
  payTo: string;
  scheme: string;
}

export type PumpdataOutcome =
  /** 200 (or 202): the answer. `paid` says whether a payment was made for it. */
  | 'ok'
  /** 402 and no wallet is configured: the offer, nothing paid. */
  | 'payment_required'
  /** 402 and the price is above PUMPDATA_MAX_PRICE_USD, or the offer is not USDC on Solana: nothing paid. */
  | 'price_refused'
  /** The paid retry came back 402: the payment was refused and nothing settled. */
  | 'payment_rejected'
  /** 503 payment_settle_uncertain: the payment may have settled. Do not pay again blindly. */
  | 'payment_uncertain'
  /** Building or signing the payment failed locally: nothing was sent. */
  | 'payment_failed'
  /** 404: unknown mint, or a window before the data begins. Nothing charged. */
  | 'not_found'
  /** 400: malformed request. Nothing charged. */
  | 'bad_request'
  /** 429: too many calls; wait `retryAfterS`. */
  | 'rate_limited'
  /** 5xx or network error. Nothing charged unless a payment was made. */
  | 'upstream_error';

export interface PumpdataResult<T = unknown> {
  outcome: PumpdataOutcome;
  status: number;
  data?: T;
  offer?: PaymentOffer;
  paid: boolean;
  /** Decoded PAYMENT-RESPONSE header (the settlement receipt), when paid. */
  receipt?: unknown;
  dataAsOf?: string;
  dataFrom?: string;
  rateLimitRemaining?: number;
  retryAfterS?: number;
  /** The server's `error` / `reason` / `detail`, or a local error message. */
  error?: string;
}

export interface PumpdataClientOptions {
  baseUrl?: string;
  apiKey?: string;
  maxPriceUsd?: number;
  payer?: X402Payer;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
}

/** USD value of an offer, when it is USDC (6 decimals); otherwise undefined. */
export function offerPriceUsd(req: PaymentRequirements): number | undefined {
  if (req.asset !== USDC_MINT) return undefined;
  const amount = Number(req.amount);
  if (!Number.isFinite(amount)) return undefined;
  return amount / 10 ** USDC_DECIMALS;
}

/** Picks the USDC-on-Solana-mainnet option of a 402 offer, the only one this plugin pays. */
export function selectOffer(pr: PaymentRequired): PaymentRequirements | undefined {
  return pr.accepts.find(
    (a) => a.scheme === 'exact' && a.network === SOLANA_MAINNET && a.asset === USDC_MINT
  );
}

function toOffer(req: PaymentRequirements): PaymentOffer {
  return {
    priceUsd: offerPriceUsd(req) ?? Number.NaN,
    amount: req.amount,
    asset: req.asset,
    network: req.network,
    payTo: req.payTo,
    scheme: req.scheme,
  };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorText(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const parts = [b.error, b.reason, b.detail].filter((x) => typeof x === 'string' && x);
    if (parts.length) return parts.join(': ');
  }
  if (typeof body === 'string' && body) return body.slice(0, 300);
  return undefined;
}

/** Reads the 402 offer from the PAYMENT-REQUIRED header (x402 v2), else from the JSON body. */
export function parsePaymentRequired(res: Response, body: unknown): PaymentRequired | undefined {
  const header = res.headers.get('payment-required');
  if (header) {
    try {
      return decodePaymentRequiredHeader(header);
    } catch {
      // fall back to the body
    }
  }
  if (body && typeof body === 'object' && Array.isArray((body as PaymentRequired).accepts)) {
    return body as PaymentRequired;
  }
  return undefined;
}

/**
 * pumpdata.fun over HTTP. Free calls are plain GETs. A paid call is sent unpaid first; on 402
 * the offer is checked (USDC on Solana mainnet, at or under the price cap), paid with the
 * configured x402 payer, and retried once with PAYMENT-SIGNATURE. Without a payer the 402
 * offer is returned and nothing is paid.
 */
export class PumpdataClient {
  readonly baseUrl: string;
  readonly maxPriceUsd: number;
  private readonly apiKey?: string;
  private readonly payer?: X402Payer;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly userAgent: string;

  constructor(options: PumpdataClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.maxPriceUsd = options.maxPriceUsd ?? DEFAULT_MAX_PRICE_USD;
    this.apiKey = options.apiKey;
    this.payer = options.payer;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.userAgent = options.userAgent ?? 'plugin-pumpdata (elizaOS)';
  }

  get canPay(): boolean {
    return this.payer !== undefined;
  }

  get payerAddress(): string | undefined {
    return this.payer?.address;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<PumpdataResult<T>> {
    const url = this.baseUrl + path;
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.userAgent,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    const init: RequestInit = {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    };

    let res: Response;
    try {
      res = await this.fetchFn(url, init);
    } catch (err) {
      return { outcome: 'upstream_error', status: 0, paid: false, error: String(err) };
    }
    if (res.status !== 402) return this.finish<T>(res, false);

    const resBody = await readBody(res);
    const pr = parsePaymentRequired(res, resBody);
    const req = pr ? selectOffer(pr) : undefined;
    if (!pr || !req) {
      return {
        outcome: 'price_refused',
        status: 402,
        paid: false,
        error: 'the 402 offer has no USDC payment on Solana mainnet',
      };
    }
    const offer = toOffer(req);
    if (!this.payer) {
      return {
        outcome: 'payment_required',
        status: 402,
        paid: false,
        offer,
        error: errorText(resBody),
      };
    }
    if (!(offer.priceUsd <= this.maxPriceUsd)) {
      return {
        outcome: 'price_refused',
        status: 402,
        paid: false,
        offer,
        error: `price $${offer.priceUsd} is above the cap of $${this.maxPriceUsd} (PUMPDATA_MAX_PRICE_USD)`,
      };
    }

    let payHeaders: Record<string, string>;
    try {
      payHeaders = await this.payer.createPaymentHeaders({ ...pr, accepts: [req] });
    } catch (err) {
      return {
        outcome: 'payment_failed',
        status: 402,
        paid: false,
        offer,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    let paidRes: Response;
    try {
      paidRes = await this.fetchFn(url, { ...init, headers: { ...headers, ...payHeaders } });
    } catch (err) {
      // The signed payment left this process; it may or may not settle.
      return { outcome: 'payment_uncertain', status: 0, paid: false, offer, error: String(err) };
    }
    return this.finish<T>(paidRes, true, offer);
  }

  private async finish<T>(
    res: Response,
    attemptedPayment: boolean,
    offer?: PaymentOffer
  ): Promise<PumpdataResult<T>> {
    const body = await readBody(res);
    const common = {
      status: res.status,
      offer,
      dataAsOf: res.headers.get('x-data-as-of') ?? undefined,
      dataFrom: res.headers.get('x-data-from') ?? undefined,
      rateLimitRemaining: numberHeader(res, 'x-ratelimit-remaining'),
    };
    if (res.status === 200 || res.status === 202) {
      let receipt: unknown;
      const receiptHeader = res.headers.get('payment-response');
      if (receiptHeader) {
        try {
          receipt = decodePaymentResponseHeader(receiptHeader);
        } catch {
          receipt = receiptHeader;
        }
      }
      return { ...common, outcome: 'ok', data: body as T, paid: attemptedPayment, receipt };
    }
    const error = errorText(body);
    if (res.status === 402) {
      return { ...common, outcome: 'payment_rejected', paid: false, error };
    }
    if (res.status === 503 && error?.includes('payment_settle_uncertain')) {
      return { ...common, outcome: 'payment_uncertain', paid: false, error };
    }
    if (res.status === 404) return { ...common, outcome: 'not_found', paid: false, error };
    if (res.status === 400) return { ...common, outcome: 'bad_request', paid: false, error };
    if (res.status === 429) {
      return {
        ...common,
        outcome: 'rate_limited',
        paid: false,
        error,
        retryAfterS: numberHeader(res, 'retry-after'),
      };
    }
    return { ...common, outcome: 'upstream_error', paid: false, error };
  }

  // The calls.

  stats(day?: string) {
    const path = day ? `/stats/${encodeURIComponent(day)}.json` : '/stats.json';
    return this.request<StatsResponse>('GET', path);
  }

  launch(mint: string) {
    return this.request<LaunchResponse>('GET', `/launch/${encodeURIComponent(mint)}`);
  }

  wallets(addresses: string[], mint?: string) {
    const body: Record<string, unknown> = { addresses };
    if (mint) body.mint = mint;
    return this.request<WalletsResponse>('POST', '/wallets', body);
  }

  deployer(address: string) {
    return this.request<DeployerResponse>('GET', `/deployer/${encodeURIComponent(address)}`);
  }

  similar(mint: string, limit?: number) {
    const q = limit ? `?limit=${Math.max(1, Math.min(25, Math.floor(limit)))}` : '';
    return this.request<SimilarResponse>('GET', `/similar/${encodeURIComponent(mint)}${q}`);
  }
}

function numberHeader(res: Response, name: string): number | undefined {
  const v = res.headers.get(name);
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Response shapes (the fields this plugin reads; the API returns more).

export interface CompareTo {
  band?: string;
  venue?: string;
  from?: string;
  to?: string;
  crossed?: number;
  reached?: Record<string, number>;
  median_peak?: number;
}

export interface LaunchResponse {
  mint: string;
  created?: string;
  age_s?: number;
  deployer?: { launches?: number; graduations?: number; best_peak?: number };
  bundle_at_creation?: { buyers_first_10s?: number; supply_share?: number };
  insider_supply_share?: number | null;
  curve_progress?: number | null;
  migrated_at?: string | null;
  market_cap_usd_at_age?: number | null;
  matches?: {
    n?: number;
    graduated_share?: number;
    peak_day1?: { p50?: number };
    close_day1?: { p50?: number };
  };
  summary?: string;
  compare_to?: CompareTo;
}

export interface WalletRecord {
  class?: string;
  pnl_sol?: number;
  put_in?: number;
  took_out?: number;
  coins?: number;
  first_seen?: string | null;
}

export type WalletsResponse = Record<string, WalletRecord>;

export interface OutcomeCounts {
  launches_measured?: number;
  doubled?: number;
  doubled_share?: number;
  ten_x?: number;
  ten_x_share?: number;
  held_2x?: number;
  held_2x_share?: number;
  dead_next_day?: number;
  dead_share?: number;
  graduated_by_5m?: number;
}

export interface DeployerResponse {
  address: string;
  record?: {
    launches?: number;
    graduations?: number;
    graduation_rate?: number;
    best_peak_usd?: number;
    last_launch_gap_s?: number;
    launches_last_day?: number;
    last_launch?: string | null;
  };
  last_90_days?: OutcomeCounts;
  recent_launches?: Array<{
    mint: string;
    created?: string;
    peak_mult_24h?: number;
    close_mult_24h?: number;
    graduated?: boolean;
    dead_next_day?: boolean;
  }>;
  next_launch?: { buckets?: Record<string, string>; launches_like_it?: OutcomeCounts };
}

export interface SimilarResponse {
  mint: string;
  at_age_s?: number;
  same_bucket_n?: number;
  comparables?: Array<{
    mint: string;
    created?: string;
    same_deployer?: boolean;
    next_24h?: { dead?: boolean; peak_mult?: number; close_mult?: number };
    similar_because?: string;
  }>;
  summary?: string;
}

export interface StatsResponse {
  day?: string;
  totals?: {
    launched?: number;
    graduated?: number;
    graduation_rate?: number;
    volume_sol?: number;
    volume_usd?: number;
    trades?: number;
    traders?: number;
    deployers?: number;
  };
  checks?: { ok?: boolean; failed?: unknown[]; warned?: unknown[] };
  coverage?: { pct?: number };
  summary?: string;
  links?: Record<string, string>;
}
