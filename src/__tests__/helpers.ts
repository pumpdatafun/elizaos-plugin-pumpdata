import { mock } from 'bun:test';
import type { IAgentRuntime, Memory, UUID } from '@elizaos/core';
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import type { PaymentRequired } from '@x402/core/types';
import launch402 from './fixtures/launch-402.json';

export const offer402 = launch402 as unknown as PaymentRequired;

export function offerWithAmount(
  amount: string,
  overrides: Record<string, unknown> = {}
): PaymentRequired {
  return {
    ...offer402,
    accepts: offer402.accepts.map((a) => ({ ...a, amount, ...overrides })),
  } as PaymentRequired;
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function res402(pr: PaymentRequired = offer402, withHeader = true): Response {
  return json(402, pr, withHeader ? { 'payment-required': encodePaymentRequiredHeader(pr) } : {});
}

export function receiptHeader(): string {
  return encodePaymentResponseHeader({
    success: true,
    transaction: '5'.repeat(88),
    network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    payer: 'TestPayer1111111111111111111111111111111111',
  } as never);
}

export interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch stand-in that returns the queued responses in order and records each call. */
export function scriptedFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = mock(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${String(url)}`);
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fn as unknown as typeof globalThis.fetch, calls };
}

export function header(call: Call, name: string): string | undefined {
  const h = call.init.headers as Record<string, string> | undefined;
  if (!h) return undefined;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
}

export function memory(text: string): Memory {
  return {
    id: crypto.randomUUID() as UUID,
    entityId: crypto.randomUUID() as UUID,
    agentId: crypto.randomUUID() as UUID,
    roomId: crypto.randomUUID() as UUID,
    content: { text, source: 'test' },
    createdAt: Date.now(),
  };
}

export function runtimeWith(
  settings: Record<string, string> = {},
  services: Record<string, unknown> = {}
): IAgentRuntime {
  return {
    agentId: crypto.randomUUID(),
    getSetting: (key: string) => settings[key] ?? null,
    getService: (type: string) => services[type] ?? null,
  } as unknown as IAgentRuntime;
}

/** Words an answer must never use as a judgement, plus hype words and the em dash. */
export const BANNED = [
  /\bscam/i,
  /\brug/i,
  /\bhoneypot/i,
  /\bmoon/i,
  /\bgem\b/i,
  /\bguaranteed\b/i,
  /\bhuge\b/i,
  /—/,
];
