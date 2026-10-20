import type { Memory } from '@elizaos/core';

/** Base58 strings of Solana address length (32 to 44 characters). */
const BASE58_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

export function findAddresses(text: string | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const m of text.matchAll(BASE58_RE)) seen.add(m[0]);
  return [...seen];
}

export function messageText(message: Memory): string {
  return typeof message.content?.text === 'string' ? message.content.text : '';
}

function optionString(
  options: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const v = options?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** One address: options[key] if given, else the first address in the message. */
export function pickAddress(
  message: Memory,
  options: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  return optionString(options, key) ?? findAddresses(messageText(message))[0];
}

/**
 * Wallets for POST /wallets: options.addresses if given, else every address in the message.
 * The mint they are buying is options.mint, or an address written right after the word "mint"
 * (or "coin" / "token"); that address is not counted as a wallet.
 */
export function pickWallets(
  message: Memory,
  options: Record<string, unknown> | undefined
): { addresses: string[]; mint?: string } {
  const text = messageText(message);
  let mint = optionString(options, 'mint');
  if (!mint) {
    const m = text.match(/\b(?:mint|coin|token)\b[\s:=]*([1-9A-HJ-NP-Za-km-z]{32,44})\b/i);
    if (m) mint = m[1];
  }
  const fromOptions = options?.addresses;
  const addresses = Array.isArray(fromOptions)
    ? fromOptions.filter((a): a is string => typeof a === 'string' && a.length > 0)
    : findAddresses(text).filter((a) => a !== mint);
  return { addresses, mint };
}
